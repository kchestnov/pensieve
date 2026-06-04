import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { authGate } from "./bot/auth.js";
import { registerCapture } from "./bot/capture.js";
import { registerCommands } from "./bot/commands.js";
import type { BotContext } from "./bot/context.js";
import { sweep } from "./bot/pending.js";
import { pensieveHome } from "./core/paths.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const bot = new Bot<BotContext>(config.token);

  // never render link previews on the bot's own messages (e.g. the note browser
  // echoing a note that contains a URL, or a saved link). Applies to all text.
  bot.api.config.use((prev, method, payload, signal) => {
    if (
      (method === "sendMessage" || method === "editMessageText") &&
      !("link_preview_options" in payload)
    ) {
      payload = { ...payload, link_preview_options: { is_disabled: true } };
    }
    return prev(method, payload, signal);
  });

  // auth first — nothing runs for unknown users
  bot.use(authGate(config.allowedUsers));

  // commands before the generic text handler so /commands aren't captured
  registerCommands(bot, config.deleteAfterSave);
  registerCapture(bot, {
    botToken: config.token,
    deleteAfterSave: config.deleteAfterSave,
  });

  bot.catch((err) => {
    console.error("bot error:", err.error);
  });

  // expire never-tapped type pickers
  const sweeper = setInterval(() => sweep(), 10 * 60 * 1000);
  sweeper.unref();

  // order here is the order Telegram shows in the command menu; /list last
  await bot.api.setMyCommands([
    { command: "help", description: "usage" },
    { command: "list", description: "recent notes" },
  ]);

  console.log(`pensieve-bot up. Writing to ${pensieveHome()}/raw`);
  await bot.start();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
