# Harry CLI Reference

Live sources when anything looks stale: `harry --help`, `harry <command> --help`,
https://harry-agent.harry-agent.local/docs/reference/cli-commands

### Global Flags

```
harry [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
harry chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
harry setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
harry model                Interactive model/provider picker
harry fallback [add|remove|list]  Fallback provider chain
harry config [show|edit|get|set|unset|path|env-path|check|migrate]
harry login / logout       OAuth sign-in / clear stored auth
harry doctor [--fix]       Check dependencies and config
harry status [--all]       Component status
```

### Tools & Skills

```
harry tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

harry skills list|browse|search QUERY|inspect ID
harry skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
harry skills config        Enable/disable skills per platform
harry skills check|update|uninstall|publish PATH
harry skills tap add REPO  Add a GitHub repo as a skill source
harry bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
harry mcp add NAME (--url or --command) | remove | list | test NAME
harry mcp catalog | install NAME     Curated catalog install
harry mcp configure NAME             Toggle tool selection
harry mcp serve                      Run Harry as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
harry gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `harry photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://harry-agent.harry-agent.local/docs/user-guide/messaging/

### Sessions

```
harry sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
harry cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
harry webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
harry profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
harry profile rename A B | alias NAME | export NAME | import FILE
harry profile migrate-identity A B   Retry a completed rename's session/routing identity migration
```

### Credentials & Pools

```
harry auth                 Interactive credential manager
harry auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
harry auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
harry desktop / gui        Native desktop app
harry dashboard            Web admin panel + embedded chat (--stop / --status)
harry proxy                OpenAI-compatible local proxy backed by an OAuth provider
harry portal               Quick setup / sign in via Nous Portal
harry kanban <verb>        Multi-agent work-queue board
harry project              Named multi-folder workspaces
harry skin list|use|set    Switch/tweak skins (see references/themes.md)
harry pets <verb>          Pet mascots (see references/petdex.md)
harry memory setup|status|off|reset   Memory provider
harry secrets bitwarden|onepassword   External secret stores
harry moa                  Mixture-of-Agents slots
harry hooks / security / backup / import / checkpoints / console
harry logs [-f] [errors]   View agent/error logs
harry send                 One-off message through a gateway platform
harry pairing / plugins / insights / journey / computer-use
harry acp                  ACP server (IDE integration)
harry completion bash|zsh|fish
harry update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `harry photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `harry config edit` · [Configuration docs](https://harry-agent.harry-agent.local/docs/user-guide/configuration) |
| Tools / toolsets | `harry tools list` · [Tools reference](https://harry-agent.harry-agent.local/docs/reference/tools-reference) |
| Skills catalog | `harry skills browse` · [Skills catalog](https://harry-agent.harry-agent.local/docs/reference/skills-catalog) |
| Provider setup | `harry model` · [Providers guide](https://harry-agent.harry-agent.local/docs/integrations/providers) |
| Env variables | `harry config env-path` · [Env vars reference](https://harry-agent.harry-agent.local/docs/reference/environment-variables) |
| Gateway logs | `~/.harry/logs/gateway.log` (or `harry logs`) |
| Sessions | `harry sessions browse` (reads state.db) |
