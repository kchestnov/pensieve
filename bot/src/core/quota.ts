import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { assetsDir } from "./paths.js";

/**
 * Upload guards for untrusted Telegram input. These are bot policy (not part of
 * the pensieve CLI): a per-file ceiling and a total cap on the assets store.
 */

/** A guard violation the bot reports back to the user. */
export class QuotaError extends Error {}

function maxFileBytes(): number {
  return Number(process.env.PENSIEVE_MAX_FILE_BYTES) || 5 * 1024 * 1024;
}

function maxTotalBytes(): number {
  return Number(process.env.PENSIEVE_MAX_TOTAL_BYTES) || 50 * 1024 * 1024 * 1024;
}

function human(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GiB` : `${mb.toFixed(1)} MiB`;
}

/** Throw if a single file exceeds the per-file ceiling. */
export function assertFileSize(bytes: number): void {
  const max = maxFileBytes();
  if (bytes > max) {
    throw new QuotaError(
      `file is ${human(bytes)}; limit is ${human(max)} per file`,
    );
  }
}

/** Total bytes currently stored under raw/assets. */
export async function assetsBytes(): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(assetsDir());
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    try {
      total += (await stat(join(assetsDir(), entry))).size;
    } catch {
      // entry vanished between readdir and stat; ignore
    }
  }
  return total;
}

/** Throw if adding `addBytes` would push the assets store over the total cap. */
export async function assertWithinQuota(addBytes: number): Promise<void> {
  const max = maxTotalBytes();
  const current = await assetsBytes();
  if (current + addBytes > max) {
    throw new QuotaError(
      `store is ${human(current)}; adding ${human(addBytes)} would exceed the ` +
        `${human(max)} cap`,
    );
  }
}
