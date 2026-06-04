# pensieve-bot

A Telegram bot that captures into your pensieve knowledge base — a second
writer into `$PENSIEVE_HOME/raw`, alongside the `pensieve` CLI. Send a message,
forward, link, or file from your phone and it lands as a typed, timestamped note
the `legilimens` pipeline can digest, exactly like a CLI capture.

TypeScript + [grammY](https://grammy.dev). No shell-out: the capture/write path
is reimplemented in `src/core` and kept byte-compatible with the CLI — see
[SCHEMA.md](SCHEMA.md).

## What it does

**Capture is button-driven.** Send a text note, forward, pasted link, or file
(document/photo/video/audio/voice) and the bot shows an inline type-picker; tap
a type and it's saved. Files are stored as assets with md5 dedup.

Telegram commands can't be Cyrillic, so there are no per-type commands — you
pick from type buttons (`Conversation / Article / Snippet / Todo`, a phone-focused
subset of the CLI's types). The bot still reads notes of any type the CLI created.

**Multi-message forwards become one note.** When you forward several messages at
once (or send a photo album), they arrive back-to-back; everything that lands
before you tap a type folds into a single capture — one picker, one note. The
texts are joined into the body; multiple files are all stored as assets (the
first fills the note's `asset:` field, all are listed in the body).

**Context is optional and after-the-fact.** The save confirmation is titled like
a `/list` entry (its context, else a preview of the body) and carries **➕ Context**
and **👁 Show** buttons. Tap *Context* and the confirmation itself switches to an
ask (no extra message — *✕ Cancel* backs out, leaving nothing behind); your next
message becomes the context, patched into the note's frontmatter, and the title
re-renders to show it. If the note already has a context, the ask shows the
current value so you can replace it — or send `-` to clear. Tap *Show* to read
the note in place (◀ Back returns, 🗑 Delete removes it). You can also delete from
the `/list` browser. Nothing ever blocks a quick capture.

**Tidy chat.** After a save the bot deletes your original message (and any
context reply), leaving just the confirmation — so a forwarded link's preview
disappears. Disable with `PENSIEVE_TG_DELETE_AFTER_SAVE=false`.

**Browse.** `/list` opens one tidy, paged, dismissable message: a page of recent
notes as buttons (label = context, else a body preview); tap one to read it in
place, with Back / 🗑 Delete / ✕ Close. Nothing piles up in the chat.

**Guards.** Only allowlisted Telegram user ids may use the bot; single files are
capped (default 5 MiB) and the asset store has a total cap (default 50 GiB).

`/legilimens` (run the pipeline) and `/ask` (query the wiki) are registered but
**not yet implemented** — see Roadmap.

## Setup

1. **Create the bot:** message [@BotFather](https://t.me/BotFather), `/newbot`,
   copy the token.
2. **Find your user id:** message [@userinfobot](https://t.me/userinfobot); it
   replies with your numeric id.
3. **Configure:**
   ```sh
   cd bot
   cp .env.example .env
   # edit .env: TELEGRAM_BOT_TOKEN, PENSIEVE_TG_ALLOWED_USERS, PENSIEVE_HOST_DIR
   ```

## Run with Docker (recommended)

The container is isolated and only ever touches the mounted store.

```sh
docker compose up --build -d
docker compose logs -f
```

`PENSIEVE_HOST_DIR` (absolute path) is mounted at `/data` inside the container;
notes appear under `$PENSIEVE_HOST_DIR/raw` on the host.

## Run locally (dev)

```sh
npm install
npm run dev      # loads .env, watches & restarts
```

`npm run build` type-checks and compiles to `dist/`; `npm start` runs the
compiled bot (set env vars yourself, e.g. `node --env-file=.env dist/index.js`).

## Configuration

| Var | Required | Default | Meaning |
|-----|----------|---------|---------|
| `TELEGRAM_BOT_TOKEN` | yes | — | BotFather token |
| `PENSIEVE_TG_ALLOWED_USERS` | yes | — | comma-separated numeric user ids |
| `PENSIEVE_HOST_DIR` | Docker only | — | absolute host path mounted at `/data` |
| `PENSIEVE_HOME` | local only | `~/pensieve` | store path outside Docker |
| `PENSIEVE_MAX_FILE_BYTES` | no | 5 MiB | per-file upload ceiling |
| `PENSIEVE_MAX_TOTAL_BYTES` | no | 50 GiB | total cap on `raw/assets` |
| `PENSIEVE_TG_DELETE_AFTER_SAVE` | no | `true` | delete your messages after a save (tidy chat) |

## Roadmap

- `/legilimens` — trigger the pipeline over `raw/` from Telegram.
- `/ask` — query the processed wiki and answer back.

Both are stubbed in `src/bot/commands.ts` with `TODO`s marking where the wiring
goes.

## Layout

```
src/
  index.ts            bootstrap: config, middleware, handlers, long-polling
  config.ts           env parsing + validation
  core/               capture logic, decoupled from Telegram
    schema.ts         note types + frontmatter shape (the CLI contract)
    note.ts           timestamp id, slugify, serialize, write, asset dedup,
                      setContext (format-preserving), deleteNote
    list.ts           listNotes / readNote (traversal-safe)
    quota.ts          per-file + total-store limits
    paths.ts          PENSIEVE_HOME / raw / assets resolution
  bot/                Telegram layer
    auth.ts           allowlist middleware
    capture.ts        type-picker capture, ➕ Context / 👁 Show confirmation
    strings.ts        all user-facing UI strings + type labels
    commands.ts       /list note browser, /help + /legilimens /ask stubs
    pending.ts        short-lived state: awaiting-type + awaiting-context
    context.ts        BotContext type
```
