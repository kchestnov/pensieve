# Pensieve Pipeline — Design

The pipeline is a separate tool that runs over `/raw` and produces processed output. Pensieve only captures — the pipeline does the thinking.

## Folder structure

```
~/workspace/wiki/
  raw/           ← pensieve writes here (AI-only, read-only for pipeline input)
    assets/      ← binary files referenced by notes
    .last-processed  ← marker file, touched after each pipeline run
  processed/     ← pipeline writes here (Obsidian or any other tool reads this)
  stories/       ← resolved @todo notes, actionable specs
```

## When it runs

On-demand, when the user has free time. Not real-time.

Discovery: find notes modified since last run:
```bash
find ~/workspace/wiki/raw -name "*.md" -newer ~/workspace/wiki/raw/.last-processed
```

After a successful run, touch `.last-processed` to advance the marker.

## Phases

### 1. Pre-processing (per note)

For notes with an `asset:` frontmatter field, process the file by type before AI sees it:
- **PDF** → `pdftotext` or `pandoc` → extract plain text
- **Image** → OCR (macOS Vision via `shortcuts` or Python)
- **Docx / other** → `pandoc`

Extracted text is appended to the note body so the AI phase works on plain text only.

### 2. AI processing (per note, by type)

Each type has a different processing intent:

| type | pipeline intent |
|------|----------------|
| `@conversation` | extract decisions, promises, announcements |
| `@article` | summarize, extract key facts and references |
| `@command` | catalog by purpose, suggest related commands |
| `@snippet` | index by language and use case |
| `@log` | identify error patterns, root causes |
| `@todo` | attempt Story resolution (see below) |

Output goes to `processed/` mirroring the `raw/` structure.

### 3. TODO resolution

This is the highest-value step.

For each `@todo` note:
1. Extract the intent (from note body + `context:` field)
2. Search the knowledge base (`processed/`) for relevant context — matching conversations, articles, snippets, commands
3. **If enough context exists** → synthesize a Story: a clear, actionable implementation spec the user can execute directly. Write to `stories/`.
4. **If not enough context** → leave as todo, annotate what knowledge is missing

A `@todo` captured today may not be resolvable yet. Re-evaluated on every pipeline run as knowledge accumulates.

## Story format

A Story is not a summary — it is an instruction document:
- What to build / do
- Why (from conversations and context)
- How (from snippets, commands, articles)
- Open questions (if any)

## State

- `.last-processed` — simple marker file, `touch`ed after each run
- Notes themselves are never modified by the pipeline — only read
- Processed output is always regeneratable from `/raw`

## Key principles

- `/raw` is append-only from pensieve, read-only for the pipeline
- Pipeline output is fully reproducible — delete `processed/` and re-run
- AI is only invoked in phase 2+, never during capture
- The pipeline is a separate script/tool, not part of pensieve
