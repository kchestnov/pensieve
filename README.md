# pensieve

A CLI tool to capture anything into a personal knowledge base — clipboard, files, stdin — tagged and timestamped for AI pipeline processing.

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/kchestnov/pensieve/pensieve-cli/install.sh | sh
```

Installs `pensieve` to `~/.local/bin/`, `_pensieve` completion to `~/.local/share/zsh/site-functions/`, and the Claude Code skill to `~/.claude/commands/` (if present). Re-run to update.

Add to `~/.claude/settings.json` to co-locate Claude Code's auto-memory with your knowledge base:

```json
{
  "autoMemoryDirectory": "~/pensieve/memory"
}
```

Add to your `.zshrc`:

```zsh
export PATH="$HOME/.local/bin:$PATH"
fpath=($HOME/.local/share/zsh/site-functions $fpath)
autoload -Uz compinit && compinit

export PENSIEVE_HOME="$HOME/pensieve"
```

## Usage

```
pensieve [@type] [context words] [-e] [-- inline content]
```

Filename is always a timestamp. Context words go into frontmatter, not the filename.

## Types

| type | covers |
|------|--------|
| `@conversation` | slack, email, any message fragment |
| `@article` | web, docs, reference material |
| `@command` | ready-to-run CLI invocation |
| `@snippet` | partial script, pattern, inspiration |
| `@log` | log output, errors, diagnostic artifacts |
| `@todo` | intent to implement, pipeline resolves into an Action |

## Flags

- `-e` — open `$EDITOR` with fully resolved content (including frontmatter) before saving

## Content sources (priority order)

1. `--` inline content
2. file path argument(s)
3. stdin (piped)
4. clipboard file URL (macOS)
5. clipboard text (macOS)

## Examples

```zsh
# with context — stored in frontmatter, helps the pipeline understand the note
pensieve @conversation standup outcome
pensieve @command useful ec2 trick -- aws ec2 describe-instances | grep myinstance
pensieve @article interesting rust post ~/Downloads/paper.pdf

# without context — valid, but the pipeline only has type and content to work with
pensieve @log
pensieve @snippet -- for f in *.md; do echo "$f"; done

# without type — saved as type: unknown, context still helps the pipeline guess intent
pensieve quick capture of this thought
pensieve -- some inline note with no classification

# stdin
kubectl logs my-pod | pensieve @log production crash

# file from Finder clipboard (macOS)
pensieve @article interesting rust post

# batch files
find ~/Downloads -name "*.pdf" | xargs pensieve @article reading list

# edit before saving — opens $EDITOR with full frontmatter,
# useful for adding tags or tweaking context before it lands
pensieve @snippet try this later -e

# same but with stdin — pipe content, then edit
kubectl logs my-pod | pensieve @log prod crash -e

# todo for pipeline resolution
pensieve @todo -- migrate auth middleware to new compliance requirements
```

Context is optional but valuable. Without it, the pipeline has only the content and `@type` to reason about the note. With it, the pipeline knows *why* you saved something — which matters most for `@todo` resolution and `@conversation` extraction.

## Frontmatter

```yaml
---
date: 2026-05-31T14:32:00
type: snippet
tags: []                         # edit with -e to add tags before saving
context: try this later          # only if context words provided
asset: assets/20260531.pdf       # only if file captured
---
```

Tags are always captured as an empty array. Use `-e` to add them at capture time, or let the pipeline tag notes during processing.

## Pipeline

The pipeline is a Claude Code agent that processes captured notes into a persistent wiki — entity pages, concept pages, cross-references, and `@todo` resolution. Run it with the `/legilimens` skill from any Claude Code session.

See [docs/pipeline.md](docs/pipeline.md) for the full design.

## License

MIT
