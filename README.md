# 🐿️ Squirrel for Claude Code

A Claude Code mod for people with ADHD who talk to Claude instead of typing, lose the thread mid-thought, or switch topics every few minutes.

You dictate a messy brain dump. Squirrel has Claude:

1. **Restructure it** in a fixed shape: the next action first, then the goal, at most 5 tasks, and the side quests.
2. **Ask only what blocks it**: at most 3 short questions with buttons, never what Claude can decide or look up.
3. **Keep one focus**: when a new message drifts to another topic, Claude asks first whether to switch (parking the current focus) or park the new idea.
4. **Park the tangents as nuts**: every side quest goes to a list that survives across sessions, so nothing is lost and nothing derails the work now.

Run `/squirrel` to open the pane: the focus now, its next action, and the parked nuts, each with **Trazer pro foco** (bring to focus: parks the current focus and starts on the nut) and **Feito ✓** (done). The pane's labels are in Portuguese for now. The status line shows the focus and how many nuts are parked.

## When it kicks in

- **auto** (default): long messages, messages full of fillers (`like`, `so`, `you know`, `tipo`, `né`, `então`…), or long run-on messages with no punctuation, as dictation tends to be.
- **always**: every message.
- **off**: only when you type `/dump <your thoughts>`.

`/dump <your thoughts>` restructures any message on demand, in any mode.

## How it works

Squirrel holds no model of its own and adds no wait to your message. It attaches instructions beside your message, so the Claude you are talking to does the restructuring in the same turn, and gives Claude two tools: `capture` (set the focus, park side quests) and `crack` (remove done ones). The nuts are kept in the mod's own store.

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

## Settings

- **When to restructure**: `auto`, `always` or `off`, as above.

Pairs well with [Savvy Progress](https://github.com/lucasaraujonrt/claude-code-savvy-progress), which shows what Claude and its agents are doing.

## License

MIT
