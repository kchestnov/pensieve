import { isValidType, type NoteType } from "../core/schema.js";

/**
 * Parse a CLI-style capture message into type / context / content.
 *
 * Mirrors how the pensieve CLI splits its args (`pensieve:193-217`):
 *   @type [context words] [-- inline content]
 *
 * Differences for Telegram: there is no clipboard/stdin fallback, so when no
 * `--` separator is present the entire remainder after the type is the note
 * body (the natural "I typed a note" case), with no context.
 */

export interface ParsedInput {
  /** undefined when the message did not begin with a recognized @type. */
  type?: NoteType;
  context: string;
  content: string;
  /** true when a leading @something was present but not a known type. */
  unknownType: boolean;
}

export function parseInput(text: string): ParsedInput {
  const trimmed = text.trim();

  let type: NoteType | undefined;
  let unknownType = false;
  let rest = trimmed;

  if (trimmed.startsWith("@")) {
    const m = trimmed.match(/^@(\S+)\s*([\s\S]*)$/);
    const tag = m?.[1] ?? "";
    if (isValidType(tag)) {
      type = tag;
      rest = m?.[2] ?? "";
    } else {
      unknownType = true;
    }
  }

  // split context / content on the first standalone `--`
  const sepMatch = rest.match(/(^|\s)--(\s|$)/);
  if (sepMatch && sepMatch.index !== undefined) {
    const before = rest.slice(0, sepMatch.index);
    const after = rest.slice(sepMatch.index + sepMatch[0].length);
    return {
      type,
      context: before.trim(),
      content: after.trim(),
      unknownType,
    };
  }

  return { type, context: "", content: rest.trim(), unknownType };
}
