import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { assetsDir, rawDir } from "./paths.js";
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
 * Save a captured file as an asset and write its note. Mirrors
 * pensieve_save_file (`pensieve:61-83`): md5 dedup against existing assets,
 * slug `<id>-<slug(base)>[.ext]`, body `[<name> — pending processing]`.
 */
export async function saveAsset(
  srcPath: string,
  originalName: string,
  type: NoteType,
  context?: string,
): Promise<WriteResult> {
  const dir = assetsDir();
  await mkdir(dir, { recursive: true });

  const date = new Date();
  const id = timestampId(date);

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
    slug = `${id}-${slugify(base)}${ext}`;
    await copyFile(srcPath, join(dir, slug));
  }

  const asset = `assets/${slug}`;
  const result = await writeNote({
    type,
    content: `[${originalName} — pending processing]`,
    context,
    asset,
    date,
  });
  return { ...result, asset };
}
