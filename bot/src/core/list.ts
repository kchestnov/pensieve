import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { rawDir } from "./paths.js";

/**
 * Read path — browse notes. Like pensieve_list_lines (`pensieve:85-100`), but
 * more useful on Telegram: the label is the note's context, else a preview of
 * the body, else "(<type>)"; newest first.
 */

export interface NoteSummary {
  id: string;
  label: string;
}

const PREVIEW_CHARS = 50;

/** First line-ish of the body, whitespace-collapsed and length-capped. */
function preview(body: string): string {
  const flat = body.trim().replace(/\s+/g, " ");
  if (flat.length <= PREVIEW_CHARS) return flat;
  return flat.slice(0, PREVIEW_CHARS - 1).trimEnd() + "…";
}

/** Note ids are timestamps: YYYYMMDD-HHMMSS-mmm. Used to reject path traversal. */
const ID_RE = /^\d{8}-\d{6}-\d{3}$/;

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

/** All note ids, newest first (cheap: no file reads). Mirrors the (On) glob. */
async function listIds(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(rawDir());
  } catch {
    return []; // raw/ may not exist yet
  }
  return entries
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter(isValidId)
    .sort()
    .reverse();
}

/** The display label for a note: context, else a body preview, else "(type)". */
export async function labelFor(id: string): Promise<string> {
  const raw = await readFile(join(rawDir(), `${id}.md`), "utf8");
  const { data, content } = matter(raw);
  const context = typeof data.context === "string" ? data.context : "";
  const type = typeof data.type === "string" ? data.type : "unknown";
  return context || preview(content) || `(${type})`;
}

async function summaryFor(id: string): Promise<NoteSummary> {
  return { id, label: await labelFor(id) };
}

export interface NotePage {
  items: NoteSummary[];
  page: number; // 0-based, clamped to range
  pages: number; // total page count (>= 1)
  total: number;
}

/** One page of notes for the browser. Reads only the page's files, not all. */
export async function listPage(page: number, pageSize = 6): Promise<NotePage> {
  const ids = await listIds();
  const total = ids.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(page, 0), pages - 1);
  const slice = ids.slice(p * pageSize, p * pageSize + pageSize);
  const items: NoteSummary[] = [];
  for (const id of slice) items.push(await summaryFor(id));
  return { items, page: p, pages, total };
}

/** Return a note's full markdown. Throws if the id is malformed or missing. */
export async function readNote(id: string): Promise<string> {
  if (!isValidId(id)) throw new Error(`invalid note id: ${id}`);
  return readFile(join(rawDir(), `${id}.md`), "utf8");
}

/** A note's current context value, or "" if none. */
export async function getContext(id: string): Promise<string> {
  if (!isValidId(id)) return "";
  const raw = await readFile(join(rawDir(), `${id}.md`), "utf8");
  const { data } = matter(raw);
  return typeof data.context === "string" ? data.context : "";
}
