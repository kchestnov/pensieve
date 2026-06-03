import type { Context } from "grammy";

/**
 * Bot context type. Plain grammY context for now; aliased so handlers and
 * middleware share one type and future session/extensions land in one place.
 */
export type BotContext = Context;
