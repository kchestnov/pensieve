# pensieve

A CLI tool to capture anything into a personal knowledge base — clipboard, files, stdin — tagged and timestamped for AI pipeline processing.

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/kchestnov/pensieve/main/install.sh | sh
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

## Telegram bot

[`bot/`](bot/) is a Telegram capture bot — a second writer into the same
`raw/` store, for CLI-like capture from your phone. It reimplements the note
format (byte-compatible with this CLI; see [bot/SCHEMA.md](bot/SCHEMA.md)),
written in TypeScript + [grammY](https://grammy.dev), and runs in Docker with
your `PENSIEVE_HOME` mounted in — so a compromised bot can only touch the store,
nothing else on the host.

### Setup

1. **Create the bot** — message [@BotFather](https://t.me/BotFather), send
   `/newbot`, copy the token.
2. **Find your user id** — message [@userinfobot](https://t.me/userinfobot); it
   replies with your numeric id (the allowlist is by id, so only you can use it).
3. **Configure**:
   ```sh
   cd bot
   cp .env.example .env
   # edit .env:
   #   TELEGRAM_BOT_TOKEN        from BotFather
   #   PENSIEVE_TG_ALLOWED_USERS comma-separated numeric ids
   #   PENSIEVE_HOST_DIR         ABSOLUTE host path to your pensieve store
   ```

### Run (Docker, recommended)

```sh
cd bot
docker compose up --build -d     # start in the background
docker compose logs -f           # follow logs
docker compose down              # stop
```

`PENSIEVE_HOST_DIR` is mounted at `/data` inside the container; notes land under
`$PENSIEVE_HOST_DIR/raw` on the host, exactly where the CLI writes. The container
needs no inbound ports — it long-polls Telegram outbound.

### Run (local dev)

```sh
cd bot
npm install
npm run dev        # loads .env, watches & restarts
npm run build      # type-check + compile to dist/
```

### Usage

Message the bot from Telegram:

| You send | Result |
|----------|--------|
| any text note / forwarded message / pasted link | bot shows type buttons; tap one to save |
| several messages forwarded at once / a photo album | folded into **one** note (one picker) |
| a file / photo / video / voice | stored as an asset (md5 dedup) after you pick a type |
| `/list` | recent notes in one tidy, paged, dismissable message |
| `/help` | usage |

Capture is **button-driven** — pick a type (`Conversation / Article / Snippet /
Todo`, a phone-focused subset of the CLI's types) from the inline keyboard. The
bot still reads notes of any type the CLI created.

Every save replies with a confirmation titled like a `/list` entry (its context,
else a preview of the body) plus **➕ Context** (add a hint for the pipeline,
patched into the note) and **👁 Show** (view the note, with Delete) buttons —
context is optional and never blocks a capture. Delete a note from the Show view
or `/list`. After
a save the bot tidies the chat by deleting your original message (toggle with
`PENSIEVE_TG_DELETE_AFTER_SAVE`).

Captured notes flow into the same [pipeline](#pipeline) — run `/legilimens` from
Claude Code to digest them into the wiki.

### Limits & safety

- **Allowlist** — only the configured Telegram user ids may use the bot.
- **Per-file cap** — uploads over `PENSIEVE_MAX_FILE_BYTES` (default 5 MiB) are rejected.
- **Total cap** — uploads are refused once `raw/assets` would exceed
  `PENSIEVE_MAX_TOTAL_BYTES` (default 50 GiB).

`/legilimens` (run the pipeline) and `/ask` (query the wiki) from Telegram are
registered but **not yet implemented**. Full details, configuration table, and
layout in [bot/README.md](bot/README.md).

## License

MIT
