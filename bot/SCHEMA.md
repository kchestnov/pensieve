# Note format — parity with the pensieve CLI

The bot and the `pensieve` CLI are **two writers of the same format** into
`$PENSIEVE_HOME/raw`. The `legilimens` pipeline reads notes without knowing or
caring which wrote them, so the two must stay byte-compatible.

There is intentionally **no shared code** — the CLI is zsh, the bot is
TypeScript — so the contract is maintained by hand. This doc is the checklist;
if you change one side, change the other.

## Sources of truth

| | Writer | File |
|---|--------|------|
| CLI | `pensieve_write_note`, `pensieve_save_file`, `pensieve_now_title`, `pensieve_slugify` | `../pensieve` (lines ~17, 22-29, 38-83) |
| Bot | `serializeNote`, `writeNote`, `saveAsset`, `timestampId`, `slugify` | `src/core/note.ts` |

The bot **hand-serializes** frontmatter rather than using a YAML library: a
generic dumper would reorder keys, quote the date, or render `tags: []`
differently. `gray-matter` is used only on the read path (`src/core/list.ts`).

## The contract

**Filename / id:** `raw/<YYYYMMDD-HHMMSS-mmm>.md` — local time, millisecond
suffix. (`timestampId` ↔ `pensieve_now_title`.)

**Frontmatter**, exact key order, `context`/`asset` lines emitted only when set:

```yaml
---
date: 2026-06-03T20:45:00      # local time, no timezone, no fractional seconds
type: <one of: conversation article command snippet log todo>
tags: []                        # always empty at capture time
context: <words>                # only if context provided
asset: assets/<slug>            # only if a file was captured
---

<content>
```

A blank line separates frontmatter from the body; the file ends with a trailing
newline.

**Assets:** copied into `raw/assets/`; slug `<id>-<slugify(basename-no-ext)>[.ext]`;
**md5 dedup** — identical content reuses the existing asset. The note body is
`[<original-name> — pending processing]`. (`saveAsset` ↔ `pensieve_save_file`.)

**slugify:** lowercase → non-`[a-z0-9-]` runs to `-` → trim leading/trailing `-`.

## Verifying parity

Point both writers at the same store and diff:

```sh
export PENSIEVE_HOME=/tmp/pensieve-test
pensieve @todo migrate auth -- do the thing       # CLI
# ...send the same via the bot...
diff <(sed -n '1,/^---$/p;/^---$/,/^---$/p' a.md) ...   # compare frontmatter blocks
```

The frontmatter (key order, `tags: []`, `date` format, blank line, trailing
newline) must match. Only the filename timestamp differs.
