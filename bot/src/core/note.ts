import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { assetsDir, rawDir } from "./paths.js";
import { isValidId } from "./list.js";
import type { NoteType } from "./schema.js";

/**
 * Capture/write path — a TypeScript port of pensieve's note logic so the bot
 * can write into raw/ without shelling out. Output must byte-match the CLI;
 * see `pensieve:17,22-29,38-83` and bot/SCHEMA.md.
 */

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/**
 * Timestamp id used as the note/asset filename, e.g. 20260603-204500-123.
 * Mirrors pensieve_now_title (`pensieve:22-29`): local time, millisecond suffix.
 */
export function timestampId(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
    `${pad(d.getMilliseconds(), 3)}`
  );
}

/** Local ISO without timezone or fractional seconds, e.g. 2026-06-03T20:45:00. */
function dateIso(d = new Date()): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Port of pensieve_slugify (`pensieve:17`): lowercase, non-[alnum-] → -, trim. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface NoteFields {
  type: NoteType;
  content: string;
  context?: string;
  asset?: string;
  /** Override the timestamp (used so batched/asset notes stay deterministic). */
  date?: Date;
}

/**
 * Serialize a note to markdown, byte-matching pensieve_write_note
 * (`pensieve:43-53`): frontmatter in fixed key order, `tags: []`, optional
 * context/asset lines, a blank line, then the body, with a trailing newline.
 */
export function serializeNote(fields: NoteFields): string {
  const { type, content, context, asset, date } = fields;
  const lines = ["---", `date: ${dateIso(date)}`, `type: ${type}`, "tags: []"];
  if (context) lines.push(`context: ${context}`);
  if (asset) lines.push(`asset: ${asset}`);
  lines.push("---", "", content);
  return lines.join("\n") + "\n";
}

export interface WriteResult {
  id: string;
  path: string;
  asset?: string;
}

/** Write a text note into raw/<id>.md. */
export async function writeNote(fields: NoteFields): Promise<WriteResult> {
  const date = fields.date ?? new Date();
  const id = timestampId(date);
  const dir = rawDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  await writeFile(path, serializeNote({ ...fields, date }), "utf8");
  return { id, path, asset: fields.asset };
}

function md5File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("md5");
    createReadStream(path)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Copy a captured file into raw/assets and return its `assets/<slug>` path,
 * without writing a note. Mirrors the asset side of pensieve_save_file
 * (`pensieve:61-81`): md5 dedup against existing assets, slug
 * `<id>-<slug(base)>[.ext]`. The caller writes the note (so one note can list
 * several assets — e.g. a forwarded album).
 */
export async function storeAsset(srcPath: string, originalName: string): Promise<string> {
  const dir = assetsDir();
  await mkdir(dir, { recursive: true });

  // dedup: reuse an existing asset with identical content
  const srcSum = await md5File(srcPath);
  let slug: string | undefined;
  for (const entry of await readdir(dir)) {
    if ((await md5File(join(dir, entry))) === srcSum) {
      slug = entry;
      break;
    }
  }

  if (!slug) {
    const ext = extname(originalName); // includes leading dot, or ""
    const base = basename(originalName, ext);
    slug = `${timestampId()}-${slugify(base)}${ext}`;
    await copyFile(srcPath, join(dir, slug));
  }

  return `assets/${slug}`;
}

/**
 * Add/replace/clear a note's `context:` line in place, preserving the exact
 * frontmatter format (key order date/type/tags/context/asset). Used by the
 * post-save "add context" flow. An empty value removes the line.
 */
export async function setContext(id: string, context: string): Promise<void> {
  if (!isValidId(id)) throw new Error(`invalid note id: ${id}`);
  const path = join(rawDir(), `${id}.md`);
  const text = await readFile(path, "utf8");
  const value = context.replace(/\s+/g, " ").trim();

  const lines = text.split("\n");
  let fmEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      fmEnd = i;
      break;
    }
  }
  if (lines[0] !== "---" || fmEnd === -1) {
    throw new Error(`malformed frontmatter in ${id}`);
  }

  let ctxIdx = -1;
  let tagsIdx = -1;
  for (let i = 1; i < fmEnd; i++) {
    if (lines[i]!.startsWith("context: ")) ctxIdx = i;
    if (lines[i]!.startsWith("tags:")) tagsIdx = i;
  }

  if (value === "") {
    if (ctxIdx !== -1) lines.splice(ctxIdx, 1);
  } else if (ctxIdx !== -1) {
    lines[ctxIdx] = `context: ${value}`;
  } else {
    // keep order: context goes right after tags (before any asset line)
    const at = (tagsIdx !== -1 ? tagsIdx : fmEnd - 1) + 1;
    lines.splice(at, 0, `context: ${value}`);
  }

  await writeFile(path, lines.join("\n"), "utf8");
}

/** Remove a note and its asset, if any. Mirrors pensieve_rm_note (`pensieve:102-110`). */
export async function deleteNote(id: string): Promise<void> {
  if (!isValidId(id)) throw new Error(`invalid note id: ${id}`);
  const path = join(rawDir(), `${id}.md`);
  const text = await readFile(path, "utf8"); // throws if the note is gone
  const m = text.match(/^asset: (.+)$/m);
  if (m) await rm(join(rawDir(), m[1]!), { force: true });
  await rm(path, { force: true });
}
