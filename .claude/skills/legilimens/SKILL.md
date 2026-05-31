# Pensieve Wiki — Schema

## Role

You are maintaining a personal wiki in this directory. When invoked, your job is to run the ingest pipeline: process any raw notes captured since the last run, integrate them into the wiki, fix any structural or semantic issues, and leave the wiki clean and consistent. You are not a general-purpose assistant here — you are a wiki maintainer.

## Wiki structure

```
$PENSIEVE_HOME/
  raw/                   ← source notes written by pensieve (read-only)
    assets/              ← binary files referenced by notes
    .last-processed      ← marker file; find notes newer than this
  wiki/
    index.md             ← catalog of all wiki pages; read this first when searching
    log.md               ← append-only operation log
    sources/             ← one summary page per raw note
    entities/            ← people, orgs, projects, systems
    concepts/            ← ideas, patterns, recurring topics
    actions/             ← resolved and pending @todo notes
  memory/                ← Claude Code auto-memory; do not process or modify
```

## Page templates

### source (`wiki/sources/<timestamp>.md`)

```markdown
---
type: source
raw: raw/<timestamp>.md
note-type: <article|conversation|command|snippet|log|todo>
tags: []
---

# <title>

<one-paragraph summary>

## Key points
- ...

## Entities
- [[entities/<name>]]

## Concepts
- [[concepts/<name>]]
```

### entity (`wiki/entities/<kebab-name>.md`)

```markdown
---
type: entity
tags: []
---

# <Name>

<one-paragraph description>

## Sources
- [[sources/<timestamp>]] — <one-line note on what this source says about the entity>
```

### concept (`wiki/concepts/<kebab-name>.md`)

```markdown
---
type: concept
tags: []
---

# <Name>

<one-paragraph description>

## Related
- [[concepts/<name>]]

## Sources
- [[sources/<timestamp>]] — <one-line note on what this source contributes>
```

### action — resolved (`wiki/actions/<timestamp>.md`)

```markdown
---
type: action
status: resolved
raw: raw/<timestamp>.md
tags: []
---

# <intent, one line>

## What
Concrete steps to execute.

## Why
The motivation — from captured conversations, articles, context field.

## How
The method — from snippets, commands, articles. Cite: [[concepts/...]], [[sources/...]].

## Open questions
Anything that remains unclear but doesn't block execution. Omit section if none.
```

### action — pending (`wiki/actions/<timestamp>.md`)

```markdown
---
type: action
status: pending
raw: raw/<timestamp>.md
tags: []
---

# <intent, one line>

## Intent
What the todo is asking for, as understood from note body and context field.

## Needs
- <specific knowledge gap blocking resolution>

## Partial context
What the wiki already has that's relevant. Cite: [[entities/...]], [[concepts/...]], [[sources/...]].
```

## Workflows

### Ingest

0. **Bootstrap**: if `wiki/index.md` does not exist, create it with empty sections (Sources, Entities, Concepts, Actions) and create an empty `wiki/log.md` before proceeding.
1. Find notes modified since `.last-processed`:
   ```bash
   find raw -name "*.md" -newer raw/.last-processed
   ```
2. For each note — pre-process assets:
   - `asset:` field present → extract text (`pdftotext`, OCR, or `pandoc` by file type)
   - Note body is a bare URL → fetch and extract page content
   - Missing tool → log a warning, continue with available text
3. For each note — integrate into the wiki:
   - Read `wiki/index.md` to identify relevant existing pages
   - Read those pages before writing anything
   - Write source page to `wiki/sources/`
   - Create or update entity pages in `wiki/entities/`
   - Create or update concept pages in `wiki/concepts/`
   - Updates are additive: append new sources, expand descriptions only if richer, flag contradictions explicitly
4. For each `@todo` note — attempt resolution (see below)
5. Re-evaluate all pending action pages against the current wiki
6. Run lint (see below)
7. Update `wiki/index.md`
8. Append ingest entry to `wiki/log.md`
9. Touch `raw/.last-processed`

### @todo resolution

1. Extract intent from note body and `context:` field
2. Read `wiki/index.md`, identify relevant pages, read them
3. If resolvable (specific intent + a *how* source + no blocking unknowns) → write resolved action page
4. If not resolvable → write pending action page with a `needs:` list

**Re-evaluation**: after all new notes are processed, re-examine every `wiki/actions/` page with `status: pending`. If the wiki now has what was listed in `needs:`, update the page to `status: resolved` with the full spec.

### Lint

Run after ingest. Find and fix before the run ends.

**Structural** (from index.md and link scanning):
- Orphan pages → add inbound links from related pages, or delete if unreachable
- Dangling links → create a stub page for the missing target
- Missing concept pages (term referenced in 3+ pages, no page exists) → create it

**Semantic** (requires reading page content):
- Contradictions → update the older page to flag or resolve the conflict; cite both sources
- Stale claims → update the page to reflect what the newer source establishes
- Missing cross-references → add `[[links]]` between related pages
- Capture gaps → note in lint log entry only; cannot be fixed without new sources

### Query

Search `wiki/index.md` first, then read relevant pages, then synthesize an answer. If the answer is substantive and reusable, file it back as a new concept or source page and append a query entry to `wiki/log.md`.

## Conventions

- **Naming**: entity and concept pages use kebab-case (`andrej-karpathy.md`, `llm-wiki.md`). Source and action pages use the raw note timestamp (`20260531-225106.md`).
- **Links**: Obsidian wiki-link syntax — `[[page-name]]` without extension, relative within `wiki/`.
- **New page vs update**: create a new entity or concept page if none exists. If one exists, update it additively — never silently overwrite a claim, flag contradictions instead.
- **index.md format**: four sections (Sources, Entities, Concepts, Actions), one entry per line: `- [[path/name]] — one-line description · metadata`.
- **log.md format**: entries prefixed `## [<ISO timestamp>] <operation>` for parseability. Append only.

## Domain notes

*Initially empty. Add entries here as you develop preferences specific to your knowledge domain: what counts as an entity worth a page, recurring concepts, tagging conventions, anything the starter template couldn't anticipate.*
