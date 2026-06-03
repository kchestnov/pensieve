/**
 * Parse and validate environment configuration. Fails fast at startup if a
 * required variable is missing, so the bot never runs half-configured.
 */

export interface Config {
  token: string;
  allowedUsers: Set<number>;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`missing required env var: ${name}`);
  }
  return v.trim();
}

export function loadConfig(): Config {
  const token = required("TELEGRAM_BOT_TOKEN");

  const ids = required("PENSIEVE_TG_ALLOWED_USERS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) {
        throw new Error(`PENSIEVE_TG_ALLOWED_USERS has a non-numeric id: ${s}`);
      }
      return n;
    });

  if (ids.length === 0) {
    throw new Error("PENSIEVE_TG_ALLOWED_USERS must list at least one user id");
  }

  // PENSIEVE_HOME and the limit vars are read where used (core/paths, core/quota)
  // and have sensible defaults; nothing to validate here.

  return { token, allowedUsers: new Set(ids) };
}
