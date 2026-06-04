import type { NoteType } from "../core/schema.js";

/** All user-facing UI strings, in one place. */

const TYPE_LABELS: Record<NoteType, string> = {
  conversation: "Conversation",
  article: "Article",
  snippet: "Snippet",
  todo: "Todo",
};

export function typeLabel(type: NoteType): string {
  return TYPE_LABELS[type];
}

export const S = {
  pickType: "Pick a type:",
  pickTypeFor: (name: string) => `Pick a type for ${name}:`,
  pickTypeMulti: (count: number) => `Pick a type for ${count} items:`,
  saved: "Saved",
  addContext: "➕ Context",
  show: "👁 Show",
  back: "◀ Back",
  del: "🗑 Delete",
  close: "✕ Close",
  cancel: "✕ Cancel",
  contextPrompt: "✍️ Send the context for this note (a few words):",
  contextCurrent: (current: string) =>
    `✍️ Current context: «${current}»\nSend new text to replace it (or "-" to clear):`,
  contextFail: "❌ Couldn't update context (note may be gone).",
  expiredToast: "Expired — please resend.",
  expiredText: "⌛ This capture expired. Resend it.",
  noNotes: "No notes yet.",
  notesTitle: (page: number, pages: number, total: number) =>
    `🗂 Notes · page ${page}/${pages} · ${total} total`,
  noteNotFound: "Note not found.",
  deleted: "🗑 Deleted.",
  deletedNoneLeft: "🗑 Deleted. No notes left.",
  deletedToast: "🗑 Deleted",
  help: [
    "*Pensieve* — capture into your knowledge base.",
    "",
    "Send a note, forward, link, or file — I'll show buttons to pick a type.",
    "",
    "After saving you get *➕ Context* (add a hint for the pipeline) and *👁 Show*. " +
      "Delete a note from the Show view or `/list`.",
    "",
    "Browse:",
    "`/list` — recent notes (one tidy, paged message)",
  ].join("\n"),
  legilimensStub: "🪄 /legilimens isn't wired up yet.",
  askStub: "🔮 /ask (wiki query) isn't wired up yet.",
};
