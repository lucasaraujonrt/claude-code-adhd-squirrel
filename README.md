# 🐿️ Squirrel for Claude Code

A Claude Code mod for people with ADHD who talk to Claude instead of typing, lose the thread mid-thought, or switch topics every few minutes.

You dictate a messy brain dump. Squirrel holds it before it reaches Claude (`Prompt dropped by hook: 🐿️ Brain dump, 404 words`) and, above the prompt:

1. **Asks what clashes**: at most 3 short questions, one at a time, in Claude Code's own question dialog (`Dúvida 1/2`), with option buttons and Other to type your own answer. Only for two asks that clash, a goal with two readings, or a detail Claude can't look up. Usually none. Dismiss the dialog and your dump goes back to the box as you typed it.
2. **Catches topic switches**: when the dump is about something other than your current focus, the first question is whether to switch (parking the current focus) or park the new idea.
3. **Puts the rewrite in your prompt box**: the next action, then **The job**, **The why**, **The guardrails** and **Done means**, in the language you spoke. Nothing invented, every name and number kept.
4. **Waits for you**: read it, tweak it, press Enter. A rewrite sent from the box is never held again. While it works, **Enviar o original** sends what you said as is and **Descartar** drops it.
5. **Parks the tangents as nuts**: ideas that are not about the goal go to a list that survives across sessions, shown under the rewrite.

Run `/squirrel` to open the pane: the focus now, its next action, and the parked nuts, each with **Trazer pro foco** (bring to focus: parks the current focus and starts on the nut) and **Feito ✓** (done). The status line shows the focus and how many nuts are parked. The UI labels follow the dump's language for the card and are in Portuguese in the pane.

## When it kicks in

- **always** (default): every message of 8 words or more. Shorter replies (`ok`, `pode mandar`) go straight through, with a reminder of the current focus.
- **auto**: long messages, messages full of fillers (`like`, `so`, `you know`, `tipo`, `né`, `então`…), or long run-on messages with no punctuation, as dictation tends to be.
- **off**: only when you type `/dump <your thoughts>`.

Slash commands and prompts other plugins send are never held.

## How it works

The prompt hook drops the message and queues it; a timer started with the session reads it with Sonnet (`$.model.complete`), once to find the focus, side quests and questions, and once more, after your answers, to write the request. Each call is a small, separate request, not your main conversation. Claude also gets two tools: `capture` (set the focus, park side quests) and `crack` (remove done ones). The nuts are kept in the mod's own store.

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
