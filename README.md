# 🐿️ Squirrel for Claude Code

A Claude Code mod for people with ADHD who talk to Claude instead of typing, lose the thread mid-thought, or switch topics every few minutes.

Your messages go straight to Claude, as you sent them: nothing is held, nothing waits. Squirrel gives Claude a short guide and two tools so that it:

1. **Finds the one goal** in a messy brain dump, past the filler, without asking you to rephrase.
2. **Keeps one focus**: the goal now and its next action, shown in the status line (`🐿️ Revisar o relatório · 2 nozes`).
3. **Parks the tangents as nuts**: ideas that are not about the goal go to a list that survives across sessions, and Claude says in one line what it parked.
4. **Catches topic switches**: when you start something else, Claude asks once whether to switch (parking the current focus) or park the new idea.
5. **Opens with the next action** and asks only when two asks clash or a detail can't be looked up, one question at a time.

Run `/squirrel` to open the pane: the focus now, its next action, and the parked nuts, each with **Trazer pro foco** (bring to focus: parks the current focus and starts on the nut) and **Feito ✓** (done). The pane is in Portuguese.

## How it works

A `prompt.compose` hook adds a short, fixed section to the system prompt (fixed, so the prompt cache still holds). Claude gets two tools: `capture` (set the focus, park side quests; with no arguments it reads them back) and `crack` (remove done ones). The nuts are kept in the mod's own store. Squirrel makes no model calls of its own.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install squirrel --marketplace lucasaraujonrt/claude-code-adhd-squirrel
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install squirrel --marketplace lucasaraujonrt/claude-code-adhd-squirrel
```

In the Claude desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `lucasaraujonrt/claude-code-adhd-squirrel`, then Add plugin.

Pairs well with [Savvy Progress](https://github.com/lucasaraujonrt/claude-code-savvy-progress), which shows what Claude and its agents are doing.

## License

MIT
