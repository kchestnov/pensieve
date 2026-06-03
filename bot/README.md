# pensieve-bot

A Telegram bot that captures into your pensieve knowledge base — a second
writer into `$PENSIEVE_HOME/raw`, alongside the `pensieve` CLI. Send a message,
forward, link, or file from your phone and it lands as a typed, timestamped note
the `legilimens` pipeline can digest, exactly like a CLI capture.

TypeScript + [grammY](https://grammy.dev). No shell-out: the capture/write path
is reimplemented in `src/core` and kept byte-compatible with the CLI — see
[SCHEMA.md](SCHEMA.md).

## What it does

- **Capture text** — send `@todo migrate auth -- do the thing` and it's saved
  immediately. Without a leading `@type`, the bot shows a type-picker keyboard.
- **Capture files** — documents, photos, video, audio, voice → stored as assets
  (with md5 dedup). Caption with `@article some context` to set type up front.
- **Browse** — `/list` shows recent notes as buttons; tap one (or `/show <id>`)
  to read it.
- **Guards** — only allowlisted Telegram user ids may use it; single files are
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
    note.ts           timestamp id, slugify, serialize, write, asset dedup
    list.ts           listNotes / readNote (traversal-safe)
    quota.ts          per-file + total-store limits
    paths.ts          PENSIEVE_HOME / raw / assets resolution
  bot/                Telegram layer
    auth.ts           allowlist middleware
    capture.ts        text + file handlers, type-picker keyboard
    commands.ts       /list /show /help + /legilimens /ask stubs
    pending.ts        short-lived store for type-picker payloads
    context.ts        BotContext type
  util/parseInput.ts  parse "@type [context] [-- content]" like the CLI
```
