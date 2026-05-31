---
description: Remove a capture from the pensieve — deletes wiki pages and purges the original raw note
disable-model-invocation: true
argument-hint: <topic, filename, or description of what to forget>
---

Remove "$ARGUMENTS" from the pensieve wiki and raw notes.

## Steps

1. **Find matching content**
   - Search `wiki/index.md` for pages related to `$ARGUMENTS`
   - Find the corresponding raw note(s) in `raw/` (match by timestamp, context, or content)
   - Check if the raw note has an `asset:` field — the asset file must be purged too

2. **Show deletion plan and confirm**
   List everything that will be removed:
   - Raw note(s) to purge (including assets)
   - Wiki source page(s) to delete
   - Entity/concept pages to delete (only those with no remaining sources after removal)
   - Entity/concept pages to update (those with other sources — remove the reference, keep the page)

   Ask the user to confirm before proceeding.

3. **Execute**
   - Delete raw note file(s)
   - Delete asset file(s) if present
   - Delete wiki source page(s)
   - For each affected entity/concept page:
     - If it has no remaining sources after removal → delete it
     - If it has other sources → remove the reference to the deleted source, keep the page
   - Delete action page(s) whose `raw:` field points to a purged note

4. **Run lint**
   Fix any dangling links created by the deletions — other pages may have linked to what was just removed.

5. **Update index and log**
   - Remove deleted pages from `wiki/index.md`
   - Append obliviate entry to `wiki/log.md`:
     ```
     ## [<ISO timestamp>] obliviate
     - Purged: raw/<timestamp>.md
     - Deleted: sources/<timestamp>.md, concepts/<name>.md
     - Updated: entities/<name>.md (source reference removed)
     ```

## Notes

- Raw purge is permanent — no recovery. Always confirm before step 3.
- If `$ARGUMENTS` matches multiple notes, list all candidates and ask which to remove before proceeding.
- `.last-processed` is not rewound — the deleted note was already processed and its timestamp no longer matters.
