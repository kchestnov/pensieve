import { randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bot, InlineKeyboard } from "grammy";
import { saveAsset, writeNote } from "../core/note.js";
import { assertFileSize, assertWithinQuota, QuotaError } from "../core/quota.js";
import { NOTE_TYPES, type NoteType } from "../core/schema.js";
import { parseInput } from "../util/parseInput.js";
import type { BotContext } from "./context.js";
import { put, take, type Pending } from "./pending.js";

/**
 * Capture handlers — the CLI-like core of the bot. Text and files become typed
 * notes in raw/. When the message carries a leading @type we save immediately;
 * otherwise we stash the payload and show a type-picker keyboard.
 */

/** Inline keyboard of the six note types, keyed to a stashed payload token. */
function typeKeyboard(token: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  NOTE_TYPES.forEach((t, i) => {
    kb.text(`@${t}`, `cap:${t}:${token}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

function savedText(id: string, type: NoteType, asset?: string): string {
  return `✅ Saved ${id} (@${type})` + (asset ? `\n📎 ${asset}` : "");
}

async function saveText(
  type: NoteType,
  context: string,
  content: string,
): Promise<string> {
  const { id } = await writeNote({ type, content, context: context || undefined });
  return savedText(id, type);
}

/** Download a Telegram file to a temp path, enforcing size/quota limits. */
async function saveFile(
  ctx: BotContext,
  botToken: string,
  type: NoteType,
  context: string,
  fileId: string,
  fileName: string,
  declaredSize?: number,
): Promise<string> {
  if (declaredSize !== undefined) {
    assertFileSize(declaredSize);
    await assertWithinQuota(declaredSize);
  }

  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram did not return a file path");
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // authoritative checks on the real byte count
  assertFileSize(buf.length);
  await assertWithinQuota(buf.length);

  const tmp = join(tmpdir(), `pensieve-${randomBytes(6).toString("hex")}-${fileName}`);
  await writeFile(tmp, buf);
  try {
    const { id, asset } = await saveAsset(tmp, fileName, type, context || undefined);
    return savedText(id, type, asset);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/** Save a stashed payload once the user picks a type (callback path). */
async function savePending(
  ctx: BotContext,
  botToken: string,
  type: NoteType,
  pending: Pending,
): Promise<string> {
  if (pending.kind === "text") {
    return saveText(type, pending.context, pending.content);
  }
  return saveFile(
    ctx,
    botToken,
    type,
    pending.context,
    pending.fileId,
    pending.fileName,
    pending.declaredSize,
  );
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

export function registerCapture(bot: Bot<BotContext>, botToken: string): void {
  // --- files (document / photo / video / audio / voice) ---
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

      // early feedback before download if Telegram told us the size
      try {
        if (f.size !== undefined) assertFileSize(f.size);
      } catch (err) {
        await ctx.reply(`⚠️ ${(err as Error).message}`);
        return;
      }

      const caption = ctx.message?.caption ?? "";
      const parsed = parseInput(caption);
      const context = parsed.context || parsed.content; // files have no body

      if (parsed.type) {
        await ctx.reply("⏳ Saving…");
        try {
          const msg = await saveFile(
            ctx,
            botToken,
            parsed.type,
            context,
            f.fileId,
            f.fileName,
            f.size,
          );
          await ctx.reply(msg);
        } catch (err) {
          await ctx.reply(replyForError(err));
        }
        return;
      }

      const tok = put({
        kind: "file",
        context,
        fileId: f.fileId,
        fileName: f.fileName,
        declaredSize: f.size,
      });
      await ctx.reply(`Pick a type for ${f.fileName}:`, {
        reply_markup: typeKeyboard(tok),
      });
    },
  );

  // --- plain text ---
  bot.on("message:text", async (ctx) => {
    const parsed = parseInput(ctx.message.text);

    if (parsed.unknownType) {
      await ctx.reply(
        `Unknown type. Use one of: ${NOTE_TYPES.map((t) => "@" + t).join(", ")}`,
      );
      return;
    }

    if (parsed.type) {
      if (!parsed.content) {
        await ctx.reply("Nothing to save — the note body is empty.");
        return;
      }
      try {
        await ctx.reply(await saveText(parsed.type, parsed.context, parsed.content));
      } catch (err) {
        await ctx.reply(replyForError(err));
      }
      return;
    }

    // no @type → stash and ask
    const tok = put({ kind: "text", context: parsed.context, content: parsed.content });
    await ctx.reply("Pick a type:", { reply_markup: typeKeyboard(tok) });
  });

  // --- type-picker callback ---
  bot.callbackQuery(/^cap:([^:]+):([0-9a-f]+)$/, async (ctx) => {
    const [, type, tok] = ctx.match as RegExpMatchArray;
    const pending = take(tok!);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Expired — please resend." });
      await ctx.editMessageText("⌛ This capture expired. Resend it.").catch(() => {});
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      const msg = await savePending(ctx, botToken, type as NoteType, pending);
      await ctx.editMessageText(msg);
    } catch (err) {
      await ctx.editMessageText(replyForError(err)).catch(() => {});
    }
  });
}

function replyForError(err: unknown): string {
  const e = err as Error;
  if (e instanceof QuotaError) return `⚠️ ${e.message}`;
  return `❌ Failed to save: ${e.message}`;
}
