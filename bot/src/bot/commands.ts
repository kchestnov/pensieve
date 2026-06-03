import { Bot, InlineKeyboard } from "grammy";
import { listNotes, readNote } from "../core/list.js";
import { NOTE_TYPES } from "../core/schema.js";
import type { BotContext } from "./context.js";

/** Slash commands: capture help, browsing, and stubs for the future pipeline. */

const HELP = [
  "*Pensieve* — capture into your knowledge base.",
  "",
  "Send a message and I'll save it. Start it with a type to skip the picker:",
  "`@todo migrate auth -- do the thing`",
  "`@article rust ownership notes`",
  "",
  "Send a file/photo (optionally caption it `@article some context`) to store it as an asset.",
  "",
  "Types: " + NOTE_TYPES.map((t) => "`@" + t + "`").join(" "),
  "",
  "Commands:",
  "`/list` — recent notes",
  "`/show <id>` — show a note",
].join("\n");

const TELEGRAM_MAX = 4096;

export function registerCommands(bot: Bot<BotContext>): void {
  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(HELP, { parse_mode: "Markdown" });
  });

  bot.command("list", async (ctx) => {
    const notes = await listNotes(20);
    if (notes.length === 0) {
      await ctx.reply("No notes yet.");
      return;
    }
    const kb = new InlineKeyboard();
    for (const n of notes) {
      const label = n.label.length > 48 ? n.label.slice(0, 47) + "…" : n.label;
      kb.text(label, `show:${n.id}`).row();
    }
    await ctx.reply("Recent notes:", { reply_markup: kb });
  });

  bot.command("show", async (ctx) => {
    const id = ctx.match.trim();
    if (!id) {
      await ctx.reply("Usage: /show <id>");
      return;
    }
    await sendNote(ctx, id);
  });

  bot.callbackQuery(/^show:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = (ctx.match as RegExpMatchArray)[1]!;
    await sendNote(ctx, id);
  });

  // --- not yet implemented (scope: capture + list only) ---
  // These are registered so the commands exist and the wiring is obvious; the
  // pipeline run and wiki query land here later. See bot/README.md (Roadmap).
  bot.command("legilimens", async (ctx) => {
    // TODO: trigger the legilimens pipeline over raw/ (e.g. invoke Claude Code
    // headless, or enqueue a run on the host) and report progress back here.
    await ctx.reply("🪄 /legilimens isn't wired up yet.");
  });

  bot.command("ask", async (ctx) => {
    // TODO: query the processed wiki and return an answer. Args in ctx.match.
    await ctx.reply("🔮 /ask (wiki query) isn't wired up yet.");
  });
}

async function sendNote(ctx: BotContext, id: string): Promise<void> {
  try {
    const note = await readNote(id);
    const body = note.length > TELEGRAM_MAX ? note.slice(0, TELEGRAM_MAX - 1) + "…" : note;
    await ctx.reply(body); // plain text: no parse_mode, so note content needs no escaping
  } catch {
    await ctx.reply(`Note not found: ${id}`);
  }
}
