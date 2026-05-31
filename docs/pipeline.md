# Pensieve Pipeline — Design

The pipeline is a Claude Code agent that runs over `raw/` and maintains a persistent wiki. Pensieve captures — the pipeline thinks.

## Architecture

Three layers:

- **`raw/`** — append-only source notes written by pensieve. The pipeline reads from here, never writes.
- **`wiki/`** — LLM-maintained knowledge base. The pipeline owns this entirely. You read it; Claude Code writes it.
- **`CLAUDE.md`** — the schema document. Defines wiki structure, page conventions, and workflow instructions for Claude Code. Installed by `install.sh`.

## Folder structure

```
$PENSIEVE_HOME/          (default: ~/pensieve/)
  raw/                   ← pensieve writes here (read-only for pipeline)
    assets/              ← binary files referenced by notes
    .last-processed      ← marker file, touched after each pipeline run
  wiki/                  ← pipeline writes here
    index.md             ← catalog of all wiki pages
    log.md               ← append-only operation log
    sources/             ← one summary page per raw note
    entities/            ← people, orgs, projects, systems
    concepts/            ← ideas, patterns, recurring topics
    actions/             ← resolved @todo notes, actionable specs
  memory/                ← Claude Code auto-memory (not processed by pipeline)
```

## Schema (CLAUDE.md)

The schema lives in `.claude/skills/legilimens/SKILL.md` in the pensieve repo and is installed by `install.sh` to `~/.claude/skills/legilimens/SKILL.md`. It is invoked as the `/legilimens` skill — Claude Code loads it at runtime, no local copy needed in `$PENSIEVE_HOME`.

It contains six sections:

**Role** — one paragraph establishing what Claude Code is doing here: maintaining a personal wiki, not answering questions. Sets the operating mode.

**Wiki structure** — the directory layout and what each directory holds. Mirrors the folder structure in this doc.

**Page templates** — frontmatter and body skeleton for each page type: source, entity, concept, action (resolved), action (pending). Claude Code fills these in; the templates enforce consistency.

**Workflows** — step-by-step instructions for each operation:
- *Ingest*: how to discover notes, run pre-processing, integrate into the wiki, run lint, update index and log
- *Lint*: the checks to run and how to fix each finding
- *Query*: how to search the wiki and when to file an answer back as a page

**Conventions** — naming rules (kebab-case for entities/concepts, timestamp for sources/actions), cross-reference syntax (`[[page-name]]`), when to create a new page vs update an existing one.

**Domain notes** — initially empty. You add entries here as you develop preferences: what counts as an entity worth a page, recurring concepts in your domain, tagging conventions, anything the starter template couldn't anticipate.

## Invocation

Run the `/legilimens` skill from any Claude Code session. The skill contains the full schema and workflow instructions — no local `CLAUDE.md` needed.

## Discovery

Find notes modified since last run:

```bash
find "$PENSIEVE_HOME/raw" -name "*.md" -newer "$PENSIEVE_HOME/raw/.last-processed"
```

After a successful run, touch `.last-processed` to advance the marker.

## Operations

### Ingest

The main operation. Runs automatically on notes found since `.last-processed`.

**First run** — if `wiki/` is empty, bootstrap before processing any notes: create the subdirectories, write `wiki/index.md` with empty sections (Sources, Entities, Concepts, Actions), and create an empty `wiki/log.md`. Ingest then proceeds normally.

**Phase 1 — Pre-processing** (per note)

Extract plain text from any non-text content so wiki integration works on text only. Extraction is in-context — nothing is written to disk. If a required tool is missing, log a warning and continue with whatever text is available.

If the note has an `asset:` frontmatter field, extract by file type:
- **PDF** → `pdftotext` or `pandoc`
- **Image** → OCR (macOS Vision via `shortcuts` or Python)
- **Docx / other** → `pandoc`

If the note body contains a bare URL (common for `@article` captures), fetch and extract the page content.

**Phase 2 — Wiki integration** (per note)

Each note is read, analyzed, and integrated into the existing wiki. A single note may touch many pages.

**Step 1 — Identify relevant existing pages**

Read `wiki/index.md` to find pages likely to be affected — entities mentioned in the note, concepts it relates to. Read those pages before writing anything.

**Step 2 — Write source page**

Every note gets a summary page in `wiki/sources/` named after the raw note timestamp (e.g. `wiki/sources/20260531-225106.md`). Frontmatter carries `type: source`, `raw:` (path to the raw note), `note-type:` (the pensieve type), and `tags:`. Body contains: a short summary, key points, and wiki links to all entities and concepts extracted.

**Step 3 — Create or update entity and concept pages**

Entities are proper nouns: people, organizations, projects, systems. Concepts are ideas, patterns, methodologies. Pages live in `wiki/entities/` and `wiki/concepts/`, named in kebab-case (e.g. `andrej-karpathy.md`, `llm-wiki.md`).

For a **new** page: write a description and link back to the source page.

For an **existing** page: updates are additive. Append the new source to the page's sources list. Expand the description only if the new note adds meaningfully richer information. Flag contradictions explicitly rather than silently overwriting.

**Step 4 — Cross-references**

All links use Obsidian wiki-link syntax: `[[page-name]]` (no extension, relative within `wiki/`). Every source page links to its entities and concepts. Every entity and concept page links back to its sources. New cross-references between existing pages are added when the current note reveals a connection.

The type field guides what to extract in steps 2–4:

| type | pipeline intent |
|------|----------------|
| `@conversation` | extract decisions, promises, announcements; update entity pages for participants |
| `@article` | summarize, extract key facts and references; create or update concept pages |
| `@command` | catalog by purpose; link to related commands and concepts |
| `@snippet` | index by language and use case; link to relevant concepts |
| `@log` | identify error patterns and root causes; link to affected system entities |
| `@todo` | attempt Action resolution (see below) |

**Phase 3 — @todo resolution**

Every `@todo` note gets an action page in `wiki/actions/` immediately, named after the raw note timestamp. The page has one of two states:

- **`status: resolved`** — a complete, actionable spec the user can execute directly
- **`status: pending`** — not yet resolvable; annotated with what knowledge is missing

**Resolution steps (per `@todo`):**
1. Extract intent from note body and `context:` field
2. Read `wiki/index.md` to identify relevant pages — entities and concepts that match the intent
3. Read those pages to gather context: what's known, what's missing
4. **If resolvable** — write a resolved action page (see Action format below)
5. **If not resolvable** — write a pending action page with a `needs:` list: the specific knowledge gaps that are blocking resolution

**Re-evaluation:**

At the end of every ingest run, after new notes are processed, all pending action pages are re-evaluated against the now-richer wiki. A todo that wasn't resolvable last week may be resolvable today. Re-evaluation updates the action page in place — pending → resolved when the gaps are filled.

**What makes a todo resolvable:**
- The intent is specific enough to write concrete steps
- At least one source covers the *how* (a snippet, command, article, or conversation)
- No critical unknowns remain that would block execution

Ambiguous intent or missing *how* → pending. A todo can remain pending indefinitely — the annotation tells you exactly what to capture next.

**After all notes are processed:**
1. Update `wiki/index.md`
2. Append ingest entry to `wiki/log.md`
3. Run lint pass (see below)
4. Touch `.last-processed`

### Lint

Runs automatically at the end of every ingest pass. The wiki must be clean when ingest completes — lint finds and fixes in the same run. Findings are documented in the lint log entry after being resolved.

Two categories of checks:

**Structural** (cheap — resolved from `index.md` and link scanning):

| check | fix |
|-------|-----|
| Orphan pages | Add inbound links from related pages, or delete if genuinely unreachable |
| Dangling links | Create a stub page for the missing target |
| Missing concept pages | A term referenced in 3+ pages with no page — create it |

**Semantic** (requires reading page content):

| check | fix |
|-------|-----|
| Contradictions | Update the older page to flag or resolve the conflict; cite both sources |
| Stale claims | Update the page to reflect what the newer source establishes |
| Missing cross-references | Add `[[links]]` between the related pages |
| Capture gaps | Note in the lint log — cannot be fixed without new sources |

Capture gaps are the only findings that are informational. Everything else is fixed before ingest ends.

### Query

User-driven. Ask questions in the Claude Code session; Claude Code searches the wiki via `index.md` and synthesizes answers. Good answers should be filed back as new pages — explorations compound in the knowledge base just like ingested sources do.

## Index and log

### index.md

Content-oriented catalog of every wiki page. Updated at the end of every ingest. Claude Code reads this first when searching for relevant pages — it avoids needing to scan the wiki directory tree and makes relevance judgments without opening files.

Organized by page type, each entry on one line: wiki link, one-line description, and type-specific metadata.

```markdown
# Wiki Index

## Sources
- [[sources/20260531-225106]] — LLM Wiki pattern by Karpathy · article · 2026-05-31

## Entities
- [[entities/andrej-karpathy]] — AI researcher, formerly OpenAI and Tesla
- [[entities/obsidian]] — Markdown-based personal knowledge management app

## Concepts
- [[concepts/llm-wiki]] — Pattern for building LLM-maintained personal knowledge bases
- [[concepts/rag]] — Retrieval-augmented generation

## Actions
- [[actions/20260531-180000]] · resolved · migrate auth middleware to new compliance requirements
- [[actions/20260531-190000]] · pending · set up distributed tracing pipeline
```

### log.md

Append-only timeline of all pipeline operations. Never edited — only appended. Each entry starts with a consistent prefix so it's grep-parseable:

```bash
grep "^## \[" wiki/log.md | tail -5
```

Three entry types:

**ingest** — one entry per run, after all notes are processed and re-evaluation is complete:
```markdown
## [2026-05-31T23:00:00] ingest
- Notes: 3 processed (2 article, 1 todo)
- Pages created: 5 (3 sources, 1 entity, 1 concept)
- Pages updated: 7
- Actions: 1 resolved (actions/20260531-180000), 2 pending re-evaluated (no change)
```

**lint** — one entry per lint pass, appended immediately after the ingest entry:
```markdown
## [2026-05-31T23:01:00] lint
- Linked orphan: entities/old-project.md → added to concepts/knowledge-management.md
- Fixed contradiction: concepts/rag.md updated per sources/20260530-100000.md
- Created: concepts/vector-embeddings.md (referenced in 3 pages, no page existed)
- Capture gap: "attention mechanisms" mentioned in 4 pages — consider adding sources
```

**query** — optional, when a useful answer is filed back as a wiki page:
```markdown
## [2026-05-31T23:15:00] query
- Question: comparison of RAG vs LLM Wiki for personal knowledge bases
- Filed: concepts/rag-vs-llm-wiki.md
```

## Wiki page types

| type | location | purpose |
|------|----------|---------|
| source | `wiki/sources/` | summary of a single raw note |
| entity | `wiki/entities/` | person, org, project, system |
| concept | `wiki/concepts/` | idea, pattern, recurring topic |
| action | `wiki/actions/` | actionable spec resolved from a `@todo` |

## Action format

Action pages live in `wiki/actions/`, named after the raw note timestamp. Frontmatter carries `type: action`, `status: resolved|pending`, `raw:` (path to the source note), and `tags:`.

An Action is an instruction document, not a summary. Two forms:

**Resolved**
```markdown
---
type: action
status: resolved
raw: raw/20260531-225106.md
tags: []
---

# <intent, one line>

## What
Concrete steps to execute.

## Why
The motivation — from captured conversations, articles, context field.

## How
The method — from snippets, commands, articles. Cite the wiki pages: [[concepts/llm-wiki]], [[sources/20260531-225106]].

## Open questions
Anything that remains unclear but doesn't block execution. Omit if none.
```

**Pending**
```markdown
---
type: action
status: pending
raw: raw/20260531-225106.md
tags: []
---

# <intent, one line>

## Intent
What the todo is asking for, as understood from note body and context field.

## Needs
- <specific knowledge gap blocking resolution>
- <specific knowledge gap blocking resolution>

## Partial context
What the wiki already has that's relevant. Cite pages: [[entities/...]], [[concepts/...]].
```

The `needs:` list is the most actionable part of a pending action — it tells you exactly what to capture next.

## Key principles

- `raw/` is append-only from pensieve, read-only for the pipeline
- `wiki/` is owned entirely by the pipeline — you read it, Claude Code writes it
- Pipeline output is fully reproducible — delete `wiki/` and re-run
- The wiki compounds: each new note integrates into the existing structure rather than producing isolated output
- `CLAUDE.md` is the schema — evolve it alongside the wiki as you learn what works for your domain
