import { Bot, InlineKeyboard } from "grammy";
import { listPage, readNote, type NotePage } from "../core/list.js";
import { deleteNote } from "../core/note.js";
import type { BotContext } from "./context.js";
import { S } from "./strings.js";

/**
 * Slash commands: help, the note browser, and stubs for the future pipeline.
 *
 * The browser is a single self-editing message — paging, open, and close all
 * edit or delete that one message, so the chat never fills with list output.
 */

const TELEGRAM_MAX = 4096;
const LABEL_MAX = 48;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** The list browser: one button per note + a nav row (◀ page/pages ▶ ✕). */
function listView(p: NotePage): { text: string; keyboard: InlineKeyboard } {
  const kb = new InlineKeyboard();
  for (const n of p.items) {
    kb.text(truncate(n.label, LABEL_MAX), `lsopen:${n.id}:${p.page}`).row();
  }
  if (p.page > 0) kb.text("◀", `ls:${p.page - 1}`);
  kb.text(`${p.page + 1}/${p.pages}`, "lsnoop");
  if (p.page < p.pages - 1) kb.text("▶", `ls:${p.page + 1}`);
  kb.text("✕", "lsx");
  return { text: S.notesTitle(p.page + 1, p.pages, p.total), keyboard: kb };
}

/** A single note opened from the browser: Back to its page, Delete, Close. */
function noteView(id: string, body: string, backPage: number): { text: string; keyboard: InlineKeyboard } {
  const kb = new InlineKeyboard()
    .text(S.del, `del:${id}:${backPage}`)
    .text(S.close, "lsx")
    .text(S.back, `ls:${backPage}`);
  return { text: truncate(body, TELEGRAM_MAX - 1), keyboard: kb };
}

export function registerCommands(bot: Bot<BotContext>, deleteAfterSave: boolean): void {
  /** Delete the command invocation so it doesn't linger (gated by the flag). */
  async function tidyInvocation(ctx: BotContext): Promise<void> {
    if (deleteAfterSave && ctx.chat && ctx.message) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
    }
  }

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(S.help, { parse_mode: "Markdown" });
  });

  bot.command("list", async (ctx) => {
    const p = await listPage(0);
    if (p.total === 0) {
      await ctx.reply(S.noNotes);
    } else {
      const v = listView(p);
      await ctx.reply(v.text, { reply_markup: v.keyboard });
    }
    await tidyInvocation(ctx);
  });

  // page the browser in place
  bot.callbackQuery(/^ls:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = Number((ctx.match as RegExpMatchArray)[1]);
    const v = listView(await listPage(page));
    await ctx.editMessageText(v.text, { reply_markup: v.keyboard }).catch(() => {});
  });

  // open a note in place, with Back to its page
  bot.callbackQuery(/^lsopen:([0-9-]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const m = ctx.match as RegExpMatchArray;
    const id = m[1]!;
    const backPage = Number(m[2]);
    try {
      const v = noteView(id, await readNote(id), backPage);
      await ctx.editMessageText(v.text, { reply_markup: v.keyboard }).catch(() => {});
    } catch {
      const kb = new InlineKeyboard().text(S.back, `ls:${backPage}`).text(S.close, "lsx");
      await ctx.editMessageText(S.noteNotFound, { reply_markup: kb }).catch(() => {});
    }
  });

  // delete from the browser, then return to the (clamped) list page
  bot.callbackQuery(/^del:([0-9-]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: S.deletedToast });
    const m = ctx.match as RegExpMatchArray;
    await deleteNote(m[1]!).catch(() => {});
    const p = await listPage(Number(m[2]));
    if (p.total === 0) {
      const kb = new InlineKeyboard().text(S.close, "lsx");
      await ctx.editMessageText(S.deletedNoneLeft, { reply_markup: kb }).catch(() => {});
    } else {
      const v = listView(p);
      await ctx.editMessageText(v.text, { reply_markup: v.keyboard }).catch(() => {});
    }
  });

  // page indicator (no-op) and close
  bot.callbackQuery("lsnoop", (ctx) => ctx.answerCallbackQuery());
  bot.callbackQuery("lsx", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => {});
  });

  // --- not yet implemented (scope: capture + list only) ---
  // Registered so the commands exist and the wiring is obvious; the pipeline run
  // and wiki query land here later. See bot/README.md (Roadmap).
  bot.command("legilimens", async (ctx) => {
    // TODO: trigger the legilimens pipeline over raw/ (e.g. invoke Claude Code
    // headless, or enqueue a run on the host) and report progress back here.
    await ctx.reply(S.legilimensStub);
  });

  bot.command("ask", async (ctx) => {
    // TODO: query the processed wiki and return an answer. Args in ctx.match.
    await ctx.reply(S.askStub);
  });
}
