import { randomBytes } from "node:crypto";

/**
 * Short-lived store for captures awaiting a type choice. When a message arrives
 * without an @type, we stash its payload here and show a type-picker keyboard;
 * the callback looks the payload back up by token. In-memory and single-process
 * by design — if the bot restarts, the user simply resends. Entries expire so a
 * never-tapped keyboard can't leak memory.
 */

export interface PendingText {
  kind: "text";
  context: string;
  content: string;
}

export interface PendingFile {
  kind: "file";
  context: string;
  fileId: string;
  fileName: string;
  /** Size Telegram reported, if any; used for an early limit check. */
  declaredSize?: number;
}

export type Pending = PendingText | PendingFile;

interface Entry {
  pending: Pending;
  createdAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const store = new Map<string, Entry>();

export function put(pending: Pending): string {
  const token = randomBytes(6).toString("hex"); // 12 chars, fits callback_data
  store.set(token, { pending, createdAt: Date.now() });
  return token;
}

export function take(token: string): Pending | undefined {
  const entry = store.get(token);
  if (!entry) return undefined;
  store.delete(token);
  return entry.pending;
}

/** Drop entries older than the TTL. Call periodically. */
export function sweep(now = Date.now()): void {
  for (const [token, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(token);
  }
}
