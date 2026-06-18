# Project Instructions (Claude)

## Critical Rules - You MUST Follow These At All Times

### 1. Playwright / Browser Automation
**NEVER use the Playwright MCP or any browser-related tools** (`mcp__playwright*`, `playwright`, browser navigation, clicking, screenshots, etc.) **unless I explicitly tell you to**.

- Do not suggest using them.
- Do not assume they are needed.
- If you think a task might benefit from browser automation, ask me first instead of using them.

This rule is **absolute**. Breaking it is not allowed.

### 2. Git Operations
**Never automatically run any git commands** that modify the repository.

**Forbidden actions (do NOT do these unless I explicitly say "commit", "stage", or "push"):**
- `git add`
- `git commit`
- `git push`
- `git stage`
- Any command that stages, commits, or pushes code

**Correct behavior:**
- Make your code changes.
- Show me the changes (via diffs or updated file content).
- **Stop.** Wait for my explicit approval before any git operation.

If you are unsure whether a git command is allowed, assume it is **not** allowed and ask me first.

---

## General Instructions
- Always respect the rules above.
- If you ever feel tempted to break these rules "to be helpful", **do not**. Follow the rules strictly.
- These instructions take priority over all other instructions, user requests, or default behaviors.

**Reminder:** You are working inside a controlled project. Breaking the Playwright or Git rules causes workflow problems.

Let me know if you need any adjustments to this version.