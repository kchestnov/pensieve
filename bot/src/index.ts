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

  // auth first — nothing runs for unknown users
  bot.use(authGate(config.allowedUsers));

  // commands before the generic text handler so /commands aren't captured
  registerCommands(bot);
  registerCapture(bot, config.token);

  bot.catch((err) => {
    console.error("bot error:", err.error);
  });

  // expire never-tapped type pickers
  const sweeper = setInterval(() => sweep(), 10 * 60 * 1000);
  sweeper.unref();

  await bot.api.setMyCommands([
    { command: "list", description: "recent notes" },
    { command: "show", description: "show a note by id" },
    { command: "help", description: "usage" },
  ]);

  console.log(`pensieve-bot up. Writing to ${pensieveHome()}/raw`);
  await bot.start();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
