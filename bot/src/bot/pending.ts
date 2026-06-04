import { randomBytes } from "node:crypto";

/**
 * Short-lived in-memory state for the two interactive steps. Single-process by
 * design; entries expire so abandoned flows can't leak. On restart the user
 * just resends.
 *
 * 1. TypePending — a capture waiting for the user to tap a type. It aggregates
 *    a *burst*: messages that arrive close together (a multi-message forward, a
 *    photo album) before a type is picked fold into one pending, so one tap
 *    saves one note. Keyed by an opaque token carried in callback_data; the
 *    chat's currently-open burst is tracked separately so new messages can find
 *    it.
 * 2. ContextAwait — a note waiting for a context message. Keyed by chat id (not
 *    the reply target): once you tap ➕ Context, your next message in that chat
 *    is the context, whether or not Telegram tags it as a formal reply.
 */

export interface PendingFile {
  fileId: string;
  fileName: string;
  declaredSize?: number;
}

export interface TypePending {
  chatId: number;
  /** text parts (message bodies + captions) in arrival order */
  textParts: string[];
  /** files in arrival order */
  files: PendingFile[];
  /** the users' original messages, deleted after a successful save */
  originalMsgIds: number[];
  /** the "pick a type" message, edited in place into the confirmation */
  promptMsgId?: number;
  /** last time a message folded into this burst (for the burst window) */
  lastTs: number;
  createdAt: number;
}

const typePendings = new Map<string, TypePending>();
const activeBurst = new Map<number, string>(); // chatId -> open burst token

export function putTypePending(p: Omit<TypePending, "createdAt">): string {
  const token = randomBytes(6).toString("hex"); // 12 chars, fits callback_data
  typePendings.set(token, { ...p, createdAt: Date.now() });
  activeBurst.set(p.chatId, token);
  return token;
}

/** Return the mutable entry (e.g. to append to the burst or record promptMsgId). */
export function getTypePending(token: string): TypePending | undefined {
  return typePendings.get(token);
}

export function takeTypePending(token: string): TypePending | undefined {
  const v = typePendings.get(token);
  if (v) {
    typePendings.delete(token);
    if (activeBurst.get(v.chatId) === token) activeBurst.delete(v.chatId);
  }
  return v;
}

/** The chat's currently-open burst, if any still exists. */
export function activeBurstFor(chatId: number): TypePending | undefined {
  const token = activeBurst.get(chatId);
  if (!token) return undefined;
  const pending = typePendings.get(token);
  if (!pending) {
    activeBurst.delete(chatId);
    return undefined;
  }
  return pending;
}

export function activeBurstToken(chatId: number): string | undefined {
  return activeBurst.get(chatId);
}

export interface ContextAwait {
  noteId: string;
  /** the confirmation message, shown in "ask" state and restored after */
  confirmationMsgId: number;
  createdAt: number;
}

const contextAwaits = new Map<number, ContextAwait>(); // key: chat id

export function putContextAwait(
  chatId: number,
  v: Omit<ContextAwait, "createdAt">,
): void {
  contextAwaits.set(chatId, { ...v, createdAt: Date.now() });
}

export function takeContextAwait(chatId: number): ContextAwait | undefined {
  const v = contextAwaits.get(chatId);
  if (v) contextAwaits.delete(chatId);
  return v;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

export function sweep(now = Date.now()): void {
  for (const [k, v] of typePendings) {
    if (now - v.createdAt > TTL_MS) {
      typePendings.delete(k);
      if (activeBurst.get(v.chatId) === k) activeBurst.delete(v.chatId);
    }
  }
  for (const [k, v] of contextAwaits) if (now - v.createdAt > TTL_MS) contextAwaits.delete(k);
}
