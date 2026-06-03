/**
 * The note schema — the contract shared with the pensieve CLI.
 *
 * The bot is a *second writer* into $PENSIEVE_HOME/raw, alongside the `pensieve`
 * zsh script. Both must produce the same frontmatter so the `legilimens`
 * pipeline can read either one. This module is the bot's source of truth for
 * that shape; the CLI's is `pensieve:38-59` (pensieve_write_note). Change them
 * together. See bot/SCHEMA.md.
 */

/** Valid capture types — mirrors PENSIEVE_TYPES in `pensieve:8`. */
export const NOTE_TYPES = [
  "conversation",
  "article",
  "command",
  "snippet",
  "log",
  "todo",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export function isValidType(t: string): t is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(t);
}

/** Frontmatter fields, in the order pensieve emits them. */
export interface Frontmatter {
  date: string; // local time, no tz, no fractional seconds: YYYY-MM-DDTHH:MM:SS
  type: NoteType;
  tags: string[]; // always [] at capture time
  context?: string; // only when context words were provided
  asset?: string; // only when a file was captured: assets/<slug>
}
