# pensieve

A CLI tool to capture anything into a personal knowledge base — clipboard, files, stdin — tagged and timestamped for AI pipeline processing.

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/kchestnov/pensieve/main/install.sh | sh
```

Installs `pensieve` to `~/.local/bin/`, `_pensieve` completion to `~/.local/share/zsh/site-functions/`, and the Claude Code skill to `~/.claude/commands/` (if present). Re-run to update.

Add to your `.zshrc`:

```zsh
export PATH="$HOME/.local/bin:$PATH"
fpath=($HOME/.local/share/zsh/site-functions $fpath)
autoload -Uz compinit && compinit

export PENSIEVE_HOME="$HOME/pensieve/"
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
| `@todo` | intent to implement, pipeline resolves into a Story |

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
# clipboard text with context
pensieve @conversation standup outcome

# inline content
pensieve @command useful ec2 trick -- aws ec2 describe-instances | grep myinstance

# stdin
kubectl logs my-pod | pensieve @log production crash

# file from arg
pensieve @article interesting rust post ~/Downloads/paper.pdf

# file from Finder clipboard (macOS)
pensieve @article interesting rust post

# batch files
find ~/Downloads -name "*.pdf" | xargs pensieve @article reading list

# edit before saving
pensieve @snippet try this later -e

# todo for pipeline resolution
pensieve @todo -- migrate auth middleware to new compliance requirements
```

## Frontmatter

```yaml
---
date: 2026-05-31T14:32:00
type: snippet
tags: []
context: try this later      # only if context words provided
asset: assets/20260531.pdf   # only if file captured
---
```

## Pipeline

See [docs/pipeline.md](docs/pipeline.md) for the design of the processing pipeline that runs over captured notes.

## License

MIT
