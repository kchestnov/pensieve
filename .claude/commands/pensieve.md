Save content from the current conversation to the Pensieve wiki.

**Request:** $ARGUMENTS

1. Run `pensieve --help` to discover available types and usage
2. Interpret the request to determine:
   - What content to save (e.g. last message, conversation summary, command output)
   - Best matching type from the available list
   - A short context phrase (goes into frontmatter, not the filename — filename is always a timestamp)
3. Pipe the content in a single command:

```bash
printf '%s' 'CONTENT' | pensieve @TYPE context words here
```

Always use `printf '%s'` to pipe content — never save to files directly or use any other approach.
