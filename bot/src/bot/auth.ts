import type { Middleware } from "grammy";
import type { BotContext } from "./context.js";

/**
 * Allowlist gate. The bot writes into a personal knowledge base, so every
 * update must come from a known user id; everyone else is politely refused and
 * the chain stops here.
 */
export function authGate(allowed: Set<number>): Middleware<BotContext> {
  return async (ctx, next) => {
    const id = ctx.from?.id;
    if (id !== undefined && allowed.has(id)) {
      await next();
      return;
    }
    await ctx.reply("Not authorized.");
  };
}
