import { homedir } from "node:os";
import { join } from "node:path";

/** Root of the knowledge base. Mirrors PENSIEVE_HOME in `pensieve:5`. */
export function pensieveHome(): string {
  return process.env.PENSIEVE_HOME || join(homedir(), "pensieve");
}

/** Append-only source notes. pensieve writes here too; the pipeline reads it. */
export function rawDir(): string {
  return join(pensieveHome(), "raw");
}

/** Binary files referenced by notes. */
export function assetsDir(): string {
  return join(rawDir(), "assets");
}
