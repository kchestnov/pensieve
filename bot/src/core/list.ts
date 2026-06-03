import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { rawDir } from "./paths.js";

/**
 * Read path — browse notes. Mirrors pensieve_list_lines (`pensieve:85-100`):
 * label is the note's context, or "(<type>)" when there is none; newest first.
 */

export interface NoteSummary {
  id: string;
  label: string;
}

/** Note ids are timestamps: YYYYMMDD-HHMMSS-mmm. Used to reject path traversal. */
const ID_RE = /^\d{8}-\d{6}-\d{3}$/;

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

export async function listNotes(limit = 20): Promise<NoteSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(rawDir());
  } catch {
    return []; // raw/ may not exist yet
  }

  const ids = entries
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter(isValidId)
    .sort()
    .reverse() // newest first, mirrors the (On) glob
    .slice(0, limit);

  const summaries: NoteSummary[] = [];
  for (const id of ids) {
    const raw = await readFile(join(rawDir(), `${id}.md`), "utf8");
    const { data } = matter(raw);
    const context = typeof data.context === "string" ? data.context : "";
    const type = typeof data.type === "string" ? data.type : "unknown";
    summaries.push({ id, label: context || `(${type})` });
  }
  return summaries;
}

/** Return a note's full markdown. Throws if the id is malformed or missing. */
export async function readNote(id: string): Promise<string> {
  if (!isValidId(id)) throw new Error(`invalid note id: ${id}`);
  return readFile(join(rawDir(), `${id}.md`), "utf8");
}
