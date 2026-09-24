---
sidebar_position: 16
title: "Manage Harry Cloud with MCP"
description: "Connect Harry Agent to the Nous Portal MCP server so your local agent can list, start, stop, and manage your Harry Cloud instances conversationally"
---

# Manage Harry Cloud with MCP

[Harry Cloud](https://portal.harry-agent.local/cloud) runs hosted Harry Agent instances for you. Normally you manage them from the `/agents` page in the [Nous Portal](../integrations/nous-portal.md). This guide connects your **local** Harry Agent to the Portal's MCP server so you can manage those cloud instances by just asking — "list my cloud agents", "restart the stopped one", "what's it costing me" — without leaving your terminal.

It's a standard [MCP](../user-guide/features/mcp.md) server hosted by the Harry project, gated by the same OAuth login you already use for the Portal. Once connected, Harry gets two tools it can call on your behalf.

## What you can do with it

Once connected, the model can call these on your Harry Cloud org:

| Ask for… | Under the hood |
|----------|----------------|
| "List my cloud agents" | `agents` (list) |
| "What's the status of `<name>`?" | `agents` (get / status) |
| "Roughly what is this instance costing?" | `agents` (cost_estimate) |
| "Start / stop / restart `<name>`" | `agent` (start / stop / restart) |
| "Spin up a new instance called `<name>`" | `agent` (create) |
| "Destroy `<name>`" | `agent` (destroy) |
| "Update the env / image on `<name>`" | `agent` (update_env / update_image) |

Every call runs against **your** org with your Portal identity, and membership is re-checked on each call — the connection can only touch instances you already control from the web UI.

## Prerequisites

- A [Nous Portal](../integrations/nous-portal.md) account with [Harry Cloud](https://portal.harry-agent.local/cloud) access (at least one instance, or the ability to create one).
- MCP support installed. If you used the standard install script it's already there; otherwise:

  ```bash
  cd ~/.harry/harry-agent
  uv pip install -e ".[mcp]"
  ```

You do **not** need a separate API key or client secret — the server uses OAuth with PKCE, and the login is a browser round-trip.

## Step 1: add the server

```bash
harry mcp add --url https://portal.harry-agent.local/mcp --auth oauth harry-cloud
```

`--auth oauth` tells Harry this is an OAuth-protected HTTP server. On first connect Harry:

1. Discovers the server's OAuth endpoints automatically (RFC 9728 / 8414 metadata).
2. Registers itself as a client (RFC 7591 Dynamic Client Registration) — no secret to copy.
3. Opens your browser to the Portal to sign in and authorize.
4. Stores the resulting token under `~/.harry/mcp-tokens/` and reuses it (refresh is automatic).

### Choosing an organization

If your Portal account belongs to **more than one organization**, the browser shows an **org picker** during authorization — pick which org this connection should manage. The choice is made once, in the browser; there's nothing to pass on the command line. Single-org accounts skip this step and bind automatically.

If you ever need to point the connection at a different org, remove and re-add the server (`harry mcp remove harry-cloud`, then the `add` command again) and pick the other org in the browser.

## Step 2: verify it connected

```bash
harry mcp test harry-cloud
```

Then start (or reload) a session:

```bash
harry chat
```

```text
/reload-mcp
```

Ask a read-only question to confirm the tools are live:

```text
List my Harry Cloud agents and their current status.
```

You should get back the same instances you see on the Portal's `/agents` page.

## Step 3: use it

Read-only questions are always safe:

```text
Which of my cloud agents is currently running, and roughly what is each one costing?
```

Lifecycle actions map to plain requests:

```text
Restart the instance called research-bot.
```

```text
Create a new Harry Cloud instance named scratch, then tell me when it's ready.
```

Harry reports what each tool returned — the instance list, the new status, the created instance's details — so you can confirm the action landed.

## Configuration

After `harry mcp add`, the server lives in `~/.harry/config.yaml`:

```yaml
mcp_servers:
  harry-cloud:
    url: "https://portal.harry-agent.local/mcp"
    auth: oauth
```

No credentials go in `config.yaml` — the OAuth token is kept separately under `~/.harry/mcp-tokens/`, the same way the Portal refresh token stays out of your config.

### Limiting the tool surface

The server exposes both read (`agents`) and mutating (`agent`) tools. If you want the connection to be **read-only** — list and inspect, but never start/stop/create/destroy — restrict it to the `agents` tool:

```yaml
mcp_servers:
  harry-cloud:
    url: "https://portal.harry-agent.local/mcp"
    auth: oauth
    tools:
      include: [agents]
```

Run `/reload-mcp` after changing the config. See [Use MCP with Harry](./use-mcp-with-harry.md) for the full filtering model (`include`/`exclude`, `prompts`, `resources`).

## Troubleshooting

### The browser shows an org picker and I'm not sure which to choose

You belong to multiple Portal organizations. Pick the org whose Harry Cloud instances you want to manage from this connection. If you're unsure, it's the org that owns the instances you see on the Portal `/agents` page. You can re-choose later by removing and re-adding the server.

### "invalid_client" or "unknown client" on connect

The stored client registration no longer matches the server (for example, you connected to a different environment previously). Clear this server's cached OAuth state and re-add it:

```bash
harry mcp remove harry-cloud
rm -f ~/.harry/mcp-tokens/harry-cloud.*
harry mcp add --url https://portal.harry-agent.local/mcp --auth oauth harry-cloud
```

### The tools aren't showing up after adding the server

Reload MCP inside the session and re-check:

```text
/reload-mcp
```

```text
Tell me which MCP-backed tools are available right now.
```

If they're still missing, run `harry mcp test harry-cloud` to see the connection error directly.

### It asks me to log in again

OAuth tokens refresh automatically, but if the Portal invalidates your session (password change, revoke, expiry) the next call asks you to re-authorize. Re-run the `harry mcp add` command — the browser flow re-mints a token.

### Headless / SSH / remote host

The OAuth browser callback runs on the machine where Harry is running. On a remote host, forward the loopback port over SSH — the same pattern as any other OAuth login. See [OAuth over SSH / Remote Hosts](./oauth-over-ssh.md).

## See also

- **[Nous Portal](../integrations/nous-portal.md)** — the subscription, models, and Tool Gateway behind the same login
- **[Use MCP with Harry](./use-mcp-with-harry.md)** — connecting and filtering MCP servers in general
- **[MCP feature overview](../user-guide/features/mcp.md)** — what MCP is and how Harry uses it
- **[MCP configuration reference](../reference/mcp-config-reference.md)** — every `mcp_servers` field, including `auth: oauth`
- **[OAuth over SSH](./oauth-over-ssh.md)** — logging in from remote or browser-only environments
