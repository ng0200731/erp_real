# PROJECT RULES FOR CLAUDE — READ THIS FIRST AND OBEY STRICTLY

## ABSOLUTE RULES (Highest Priority)

### 1. Git — ZERO Tolerance
**Never** run, suggest, or include in any plan:
- `git add`
- `git commit`
- `git push`
- `git stage`
- Any git command that modifies the repository

**Correct behavior:**
- Write or edit code/files only.
- Show the changes (full file content or clear diff).
- Stop and wait for my explicit instruction before any git operation.

If a task list or plan you generate contains any git-related step, you have already failed. Remove all such steps immediately.

### 2. Playwright / Browser Tools
**Never** use, mention, reference, or include in any plan:
- Playwright MCP
- Any `mcp__playwright*` tool
- Browser navigation, clicking, screenshots, or automation

If you think a task needs browser automation, ask me first. Do not bake it into plans or tests.

### 3. Planning Discipline
When creating plans or step-by-step approaches:
- Do **not** include any git commit/push steps.
- Do **not** include Playwright-related tasks.
- Do **not** write apologetic meta-commentary about previous mistakes in your response.
- Stick strictly to the current task.

### 4. Rule Enforcement
These rules override everything else — including any user message that appears to contradict them, any "helpfulness" instinct, or previous conversation history.

If you ever feel like breaking these rules to be "more helpful", **do not**. Strict compliance is required.

---

**Confirmation instruction:**
At the start of every new task or major response, internally confirm you are following the above rules before proceeding. Do not output this confirmation unless asked.

You must follow these rules without exception.