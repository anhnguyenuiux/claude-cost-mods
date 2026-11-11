# claude-cost-mods

Two Claude Code mods that cut spend on simple work. Both run locally and send no prompt text anywhere.

## effort-optimizer

Picks the reasoning effort for each main-conversation turn from rules on the prompt:

- **high**: high-stakes keywords (auth, security, production, deploy, migrate, payment, architecture), prompts over 1200 characters, or four or more files mentioned
- **low**: short lookups and mechanical edits (explain, list, rename, git status), or very short prompts
- **medium**: everything else

A band above the prompt shows the chosen effort and why, and a toast appears when it differs from the session's level. It does nothing on models without an effort setting.

## subagent-model-selector

Chooses a model for each subagent that names none:

| Role | Model |
| --- | --- |
| Explore, search, information gathering | haiku |
| Mechanical or bulk edits | haiku |
| Writing and fixing code | sonnet |
| Review, audit, security, critique | opus, effort high |

Forks, teammates, resumed agents, and calls that set a model themselves are left alone. The role is guessed from the agent type, its description and the start of its prompt, so oddly named agents fall back to sonnet.

## Install

At the prompt of a terminal session:

```
/plugin install effort-optimizer --marketplace anhnguyenuiux/claude-cost-mods
/plugin install subagent-model-selector --marketplace anhnguyenuiux/claude-cost-mods
```

From a shell:

```
claude plugin install effort-optimizer --marketplace anhnguyenuiux/claude-cost-mods
claude plugin install subagent-model-selector --marketplace anhnguyenuiux/claude-cost-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `anhnguyenuiux/claude-cost-mods`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope (user scope covers every project).

## Tuning

Edit the keyword lists and the model table at the top of each `hooks/register.tsx`.

## License

MIT
