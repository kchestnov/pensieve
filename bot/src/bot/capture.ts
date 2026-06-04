import { randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Bot, InlineKeyboard } from "grammy";
import { deleteNote, setContext, storeAsset, writeNote } from "../core/note.js";
import { getContext, labelFor, readNote } from "../core/list.js";
import { assertFileSize, assertWithinQuota, QuotaError } from "../core/quota.js";
import { NOTE_TYPES, type NoteType } from "../core/schema.js";
import type { BotContext } from "./context.js";
import { S, typeLabel } from "./strings.js";
import {
  activeBurstFor,
  activeBurstToken,
  getTypePending,
  putContextAwait,
  putTypePending,
  takeContextAwait,
  takeTypePending,
  type PendingFile,
  type TypePending,
} from "./pending.js";

/**
 * Capture handlers. Everything is button-driven (Telegram commands can't be
 * Cyrillic): send a note, forward, link, or file and pick a type from an inline
 * keyboard.
 *
 * Messages that arrive close together before a type is picked — a multi-message
 * forward, a photo album — fold into one capture (one picker, one note). The
 * save confirmation carries ➕ Context and 👁 Show; deletion lives in the Show
 * view and the /list browser. Context is added after the fact and never blocks
 * capture.
 */

export interface CaptureOptions {
  botToken: string;
  /** delete the user's messages after a save, to keep the chat tidy */
  deleteAfterSave: boolean;
}

const TELEGRAM_MAX = 4096;
/** A new message within this window of the last one joins the open burst. */
const BURST_WINDOW_MS = 2000;

/** Buttons on a save confirmation: add context, or view the note. */
function confirmationKeyboard(id: string): InlineKeyboard {
  return new InlineKeyboard().text(S.addContext, `ctx:${id}`).text(S.show, `csshow:${id}`);
}

/** Inline keyboard of the note types. */
function typeKeyboard(token: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  NOTE_TYPES.forEach((type, i) => {
    kb.text(typeLabel(type), `pick:${type}:${token}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

/** The picker prompt, reflecting how many items the burst holds. */
function promptText(p: TypePending): string {
  const count = p.textParts.length + p.files.length;
  if (count > 1) return S.pickTypeMulti(count);
  if (p.files.length === 1 && p.textParts.length === 0) return S.pickTypeFor(p.files[0]!.fileName);
  return S.pickType;
}

/** Confirmation title: the same label /list shows (context / preview / type). */
async function confirmationText(id: string): Promise<string> {
  return `✅ ${S.saved}: ${await labelFor(id)}`;
}

function replyForError(err: unknown): string {
  const e = err as Error;
  if (e instanceof QuotaError) return `⚠️ ${e.message}`;
  return `❌ Failed to save: ${e.message}`;
}

export function registerCapture(bot: Bot<BotContext>, opts: CaptureOptions): void {
  const { botToken, deleteAfterSave } = opts;

  /** Best-effort delete of the user's messages, gated by the tidy-chat flag. */
  async function tidy(ctx: BotContext, chatId: number, msgIds: number[]): Promise<void> {
    if (!deleteAfterSave) return;
    for (const id of msgIds) {
      await ctx.api.deleteMessage(chatId, id).catch(() => {});
    }
  }

  /**
   * Add a message to the chat's open burst, or start a new one. Updates run
   * sequentially under bot.start(), so a forwarded batch lands here in order and
   * folds into a single pending before any type is tapped.
   */
  async function ingest(ctx: BotContext, parts: { text?: string; file?: PendingFile }): Promise<void> {
    const chatId = ctx.chat!.id;
    const msgId = ctx.message!.message_id;
    const now = Date.now();

    const active = activeBurstFor(chatId);
    if (active && now - active.lastTs <= BURST_WINDOW_MS) {
      if (parts.text) active.textParts.push(parts.text);
      if (parts.file) active.files.push(parts.file);
      active.originalMsgIds.push(msgId);
      active.lastTs = now;
      const token = activeBurstToken(chatId);
      if (active.promptMsgId !== undefined && token) {
        await ctx.api
          .editMessageText(chatId, active.promptMsgId, promptText(active), {
            reply_markup: typeKeyboard(token),
          })
          .catch(() => {});
      }
      return;
    }

    const token = putTypePending({
      chatId,
      textParts: parts.text ? [parts.text] : [],
      files: parts.file ? [parts.file] : [],
      originalMsgIds: [msgId],
      lastTs: now,
    });
    const pending = getTypePending(token)!;
    const prompt = await ctx.reply(promptText(pending), { reply_markup: typeKeyboard(token) });
    pending.promptMsgId = prompt.message_id;
  }

  /** Download a Telegram file (enforcing limits) and copy it into raw/assets. */
  async function downloadAndStore(ctx: BotContext, f: PendingFile): Promise<{ asset: string; name: string }> {
    if (f.declaredSize !== undefined) {
      assertFileSize(f.declaredSize);
      await assertWithinQuota(f.declaredSize);
    }

    const file = await ctx.api.getFile(f.fileId);
    if (!file.file_path) throw new Error("Telegram did not return a file path");
    const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    // authoritative checks on the real byte count
    assertFileSize(buf.length);
    await assertWithinQuota(buf.length);

    // basename() the Telegram name so it can't escape tmpdir() via / or ..
    const safeName = basename(f.fileName) || "file";
    const tmp = join(tmpdir(), `pensieve-${randomBytes(6).toString("hex")}-${safeName}`);
    await writeFile(tmp, buf);
    try {
      return { asset: await storeAsset(tmp, f.fileName), name: f.fileName };
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }

  /** Persist a whole burst as one note; returns its id. */
  async function saveBurst(ctx: BotContext, pending: TypePending, type: NoteType): Promise<string> {
    const combinedText = pending.textParts.join("\n\n").trim();
    if (pending.files.length === 0) {
      return (await writeNote({ type, content: combinedText })).id;
    }
    // store every file; the note lists them all, the first fills the asset: field
    const stored: { asset: string; name: string }[] = [];
    for (const f of pending.files) {
      stored.push(await downloadAndStore(ctx, f));
    }
    const lines: string[] = [];
    if (combinedText) lines.push(combinedText, "");
    for (const s of stored) lines.push(`[${s.name} — pending processing]`);
    return (await writeNote({ type, content: lines.join("\n"), asset: stored[0]!.asset })).id;
  }

  // --- files (document / photo / video / audio / voice) → burst, then picker ---
  bot.on(
    [
      "message:document",
      "message:photo",
      "message:video",
      "message:audio",
      "message:voice",
    ],
    async (ctx) => {
      const f = pickFile(ctx);
      if (!f) return;

      try {
        if (f.size !== undefined) assertFileSize(f.size);
      } catch (err) {
        await ctx.reply(replyForError(err));
        return;
      }

      const caption = ctx.message?.caption?.trim();
      await ingest(ctx, {
        text: caption || undefined,
        file: { fileId: f.fileId, fileName: f.fileName, declaredSize: f.size },
      });
    },
  );

  // --- plain text / forwards → context reply, else burst + picker ---
  bot.on("message:text", async (ctx) => {
    // a reply to a "context" prompt?
    if (await handleContextReply(ctx)) return;

    const text = ctx.message.text;
    if (text.startsWith("/")) return; // stray/unknown command, not a capture

    const content = text.trim();
    if (!content) return;

    await ingest(ctx, { text: content });
  });

  // --- type chosen: save the burst, and turn the prompt into the confirmation ---
  bot.callbackQuery(/^pick:([^:]+):([0-9a-f]+)$/, async (ctx) => {
    const [, type, token] = ctx.match as RegExpMatchArray;
    const pending = takeTypePending(token!);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: S.expiredToast });
      await ctx.editMessageText(S.expiredText).catch(() => {});
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      const id = await saveBurst(ctx, pending, type as NoteType);
      await ctx.editMessageText(await confirmationText(id), { reply_markup: confirmationKeyboard(id) });
      await tidy(ctx, pending.chatId, pending.originalMsgIds);
    } catch (err) {
      await ctx.editMessageText(replyForError(err)).catch(() => {});
    }
  });

  // --- ➕ Context: turn the confirmation into an "ask" state (no extra message,
  //     so nothing lingers if you change your mind — just tap ✕ Cancel) ---
  bot.callbackQuery(/^ctx:([0-9-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const noteId = (ctx.match as RegExpMatchArray)[1]!;
    const confirmation = ctx.callbackQuery.message;
    if (!confirmation) return;
    // Telegram can't pre-fill an editable reply, so surface the existing context
    // in the message; your next message replaces it (chat-keyed, see below).
    const current = await getContext(noteId).catch(() => "");
    const ask = current ? S.contextCurrent(current) : S.contextPrompt;
    const kb = new InlineKeyboard().text(S.cancel, `ctxcancel:${noteId}`);
    await ctx.editMessageText(ask, { reply_markup: kb }).catch(() => {});
    putContextAwait(ctx.chat!.id, { noteId, confirmationMsgId: confirmation.message_id });
  });

  // --- ✕ Cancel: drop the ask and restore the confirmation ---
  bot.callbackQuery(/^ctxcancel:([0-9-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = (ctx.match as RegExpMatchArray)[1]!;
    if (ctx.chat) takeContextAwait(ctx.chat.id);
    await ctx.editMessageText(await confirmationText(id), { reply_markup: confirmationKeyboard(id) }).catch(() => {});
  });

  // --- 👁 Show: view the note in place; ◀ Back / 🗑 Delete ---
  bot.callbackQuery(/^csshow:([0-9-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = (ctx.match as RegExpMatchArray)[1]!;
    try {
      const note = await readNote(id);
      const body = note.length > TELEGRAM_MAX ? note.slice(0, TELEGRAM_MAX - 1) + "…" : note;
      const kb = new InlineKeyboard().text(S.del, `csdel:${id}`).text(S.back, `csback:${id}`);
      await ctx.editMessageText(body, { reply_markup: kb }).catch(() => {});
    } catch {
      await ctx.editMessageText(S.noteNotFound).catch(() => {});
    }
  });

  // --- ◀ Back: re-render the save confirmation ---
  bot.callbackQuery(/^csback:([0-9-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = (ctx.match as RegExpMatchArray)[1]!;
    await ctx.editMessageText(await confirmationText(id), { reply_markup: confirmationKeyboard(id) }).catch(() => {});
  });

  // --- 🗑 Delete (from the Show view): remove the note + asset, then tombstone ---
  bot.callbackQuery(/^csdel:([0-9-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: S.deletedToast });
    const id = (ctx.match as RegExpMatchArray)[1]!;
    await deleteNote(id).catch(() => {});
    await ctx.editMessageText(S.deleted, { reply_markup: { inline_keyboard: [] } }).catch(() => {});
  });

  /**
   * If this chat is awaiting context (the user tapped ➕ Context), treat the
   * message as that context. Matched by chat, not by reply linkage, so it works
   * even when Telegram doesn't tag the message as a formal reply. Returns true
   * if consumed.
   */
  async function handleContextReply(ctx: BotContext): Promise<boolean> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return false;
    const awaiting = takeContextAwait(chatId);
    if (!awaiting) return false;

    const raw = (ctx.message?.text ?? "").trim();
    const context = raw === "-" ? "" : raw; // "-" clears
    try {
      await setContext(awaiting.noteId, context);
      // restore the confirmation; its title re-renders to show the new context
      await ctx.api
        .editMessageText(chatId, awaiting.confirmationMsgId, await confirmationText(awaiting.noteId), {
          reply_markup: confirmationKeyboard(awaiting.noteId),
        })
        .catch(() => {});
    } catch {
      await ctx.api
        .editMessageText(chatId, awaiting.confirmationMsgId, S.contextFail, {
          reply_markup: { inline_keyboard: [] },
        })
        .catch(() => {});
    }
    await tidy(ctx, chatId, [ctx.message!.message_id]);
    return true;
  }
}

/** Extract the first downloadable attachment from a message, if any. */
function pickFile(
  ctx: BotContext,
): { fileId: string; fileName: string; size?: number } | undefined {
  const m = ctx.message;
  if (!m) return undefined;
  if (m.document) {
    return {
      fileId: m.document.file_id,
      fileName: m.document.file_name ?? `document-${m.document.file_unique_id}`,
      size: m.document.file_size,
    };
  }
  if (m.photo && m.photo.length > 0) {
    const largest = m.photo[m.photo.length - 1]!;
    return {
      fileId: largest.file_id,
      fileName: `photo-${largest.file_unique_id}.jpg`,
      size: largest.file_size,
    };
  }
  if (m.video) {
    return {
      fileId: m.video.file_id,
      fileName: m.video.file_name ?? `video-${m.video.file_unique_id}.mp4`,
      size: m.video.file_size,
    };
  }
  if (m.audio) {
    return {
      fileId: m.audio.file_id,
      fileName: m.audio.file_name ?? `audio-${m.audio.file_unique_id}`,
      size: m.audio.file_size,
    };
  }
  if (m.voice) {
    return {
      fileId: m.voice.file_id,
      fileName: `voice-${m.voice.file_unique_id}.ogg`,
      size: m.voice.file_size,
    };
  }
  return undefined;
}
