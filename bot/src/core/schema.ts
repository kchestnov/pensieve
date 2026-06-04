/**
 * The note schema — the contract shared with the pensieve CLI.
 *
 * The bot is a *second writer* into $PENSIEVE_HOME/raw, alongside the `pensieve`
 * zsh script. Both must produce the same frontmatter so the `legilimens`
 * pipeline can read either one. This module is the bot's source of truth for
 * that shape; the CLI's is `pensieve:38-59` (pensieve_write_note). Change them
 * together. See bot/SCHEMA.md.
 */

/**
 * Capture types offered by the bot — a subset of the CLI's PENSIEVE_TYPES
 * (`pensieve:8`). The bot only *writes* these, but it can *read* notes of any
 * type the CLI created (list/show don't constrain the `type` value).
 */
export const NOTE_TYPES = ["conversation", "article", "snippet", "todo"] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

/** Frontmatter fields, in the order pensieve emits them. */
export interface Frontmatter {
  date: string; // local time, no tz, no fractional seconds: YYYY-MM-DDTHH:MM:SS
  type: NoteType;
  tags: string[]; // always [] at capture time
  context?: string; // only when context words were provided
  asset?: string; // only when a file was captured: assets/<slug>
}
