# pensieve

A personal knowledge base for capturing anything — clipboard, files, stdin, Telegram messages — tagged and timestamped for AI pipeline processing.

Captured notes live in `$PENSIEVE_HOME/raw/` as plain markdown with YAML frontmatter. The `legilimens` pipeline processes them into a structured wiki: entity pages, concept pages, cross-references, and `@todo` resolution.

## Branches

- [`pensieve-cli`](../../tree/pensieve-cli) — the `pensieve` CLI tool (zsh, macOS)
- [`pensieve-bot`](../../tree/pensieve-bot) — the Telegram capture bot (TypeScript, Docker)

## License

MIT
