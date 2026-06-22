# Governed AI access for ReinaManager (optional)

This folder lets an AI assistant (Claude Desktop, Cursor, …) safely **operate your library** — add
and edit games, organize collections, record and review play sessions — without screen-scraping and
without hand-editing the SQLite database. It exposes a **narrow, permissioned, audited** subset of
ReinaManager's own actions as a [Model Context Protocol](https://modelcontextprotocol.io) server.

It is **optional and off by default**, adds **no dependency** to the app, and the only change to the
app itself is making two internal modules `pub` so the executor can reuse them. If you never wire it
into an assistant, none of this runs.

> Why this exists: ReinaManager is local-first with no API, so an assistant could otherwise only
> touch your library by automating the UI or by blindly rewriting `reina_manager.db` (which means
> reproducing the schema, the `games`/`collections` relations and the migration state by hand). This
> gives the agent a governed door instead: every action runs the **same repository code** the app's
> own Tauri commands run, every change is **signed into an audit log**, and destructive actions are
> **gated on a one-click human approval**.

---

## What you get

- 🔒 **Permissions** — the agent can only call allow-listed actions (everything else denied).
- ✋ **Human approval** — deletes (`delete_game`, `delete_games_batch`, `delete_collection`,
  `delete_game_session`, `delete_game_statistics`) pause for a one-click yes/no.
- 🧾 **Signed audit log** — every executed action is an Ed25519-signed receipt you can replay.
- 💸 **Budget cap** — at most N actions per rolling minute.

## How it works

```
  Claude Desktop ──MCP/stdio──▶  kriya-mcp  ──one JSON line per action──▶  kriya_exec
  (the agent)                    (governor)                               (ReinaManager's data layer)
                                    │                                          │
                          policy ▸ approval ▸ budget ▸ audit          reuses database::*::Repository,
                          (agent-policy.yaml)                          opens the same reina_manager.db
```

- **`kriya_exec`** (`src-tauri/src/bin/kriya_exec.rs`, registered automatically as a `[[bin]]`) opens
  the app's own database via `database::db::establish_connection` (identical path logic to the app),
  runs the same `migration::Migrator`, and dispatches each action straight to the `*Repository`
  methods that `database::service`'s Tauri commands call. So an agent action runs the **identical
  code** a human action does — only the Tauri `State` wrapper is bypassed (it can't run outside the
  app). No GUI, no rewrite, no `kriya` dependency added to the app.
- **`kriya-mcp`** (the open-source [`kriya`](https://crates.io/crates/kriya) crate) is the external
  governor: it enforces every gate before forwarding a cleared action to `kriya_exec`.

## Enable it

1. **Build the app once** so the frontend `dist/` exists (the executor links the app library, which
   embeds the bundle): in the repo root, `pnpm install && pnpm build` (or your usual app build).
2. **Build the executor** (release):
   ```bash
   cd src-tauri
   cargo build --release --bin kriya_exec   # → src-tauri/target/release/kriya_exec
   ```
3. **Install the governor:** `cargo install kriya` (provides `kriya-mcp` on your PATH).
4. **Try the executor directly first** (no governor; opens your real DB):
   ```bash
   printf '%s\n' \
     '{"action":"count_games","params":{}}' \
     '{"action":"list_games","params":{}}' \
   | ./target/release/kriya_exec
   ```
5. **Wire it into your assistant:** copy the `mcpServers.reina-manager` block from
   [`.mcp.json`](.mcp.json) into your assistant's MCP config (Claude Desktop on macOS:
   `~/Library/Application Support/Claude/claude_desktop_config.json`), replacing the placeholders.

## Governance model

| Tier | Actions | Policy |
|---|---|---|
| Read | `count_games`, `list_games`, `get_game`, `list_collections`, `get_games_in_collection`, `get_game_collection_ids`, `get_game_statistics`, `get_all_game_statistics`, `get_game_sessions` | allow |
| Add / edit / organize | `add_game`, `update_game`, `create_collection`, `update_collection`, `add_games_to_collections`, `set_game_collections`, `remove_games_from_collection`, `record_session`, `init_game_statistics` | allow + audit |
| Destructive | `delete_game`, `delete_games_batch`, `delete_collection`, `delete_game_session`, `delete_game_statistics` | **human approval** + audit |
| Anything else | — | **denied** |

Edit [`agent-policy.yaml`](agent-policy.yaml) to tighten/loosen; the exposed surface is in
[`tools.json`](tools.json).

## Notes for agents

- **Ids are assigned by the database** — omit ids on creation; the response includes them.
- **Adding a game:** `id_type` is required (e.g. `"custom"`); pass metadata via `custom_data`
  (`{name, developer, summary, tags, …}`) and/or `bgm_data`/`vndb_data`.
- **The database is the live file** — the executor reads/writes the same `reina_manager.db` the app
  uses. If ReinaManager is open while the agent works, the app won't reflect the changes until that
  view is reloaded (or the app restarted); for bulk changes, run with the app closed to avoid SQLite
  lock contention.
- **`delete_game` removes the DB row only** — the app's own delete additionally clears that game's
  cover-cache directory; orphaned covers are harmless and cleaned up by normal app use.

## Approval on each OS · audit log

`--approval gui` is a native dialog (works under Claude Desktop's no-terminal host). On Linux/Windows
you can run `kriya-mcp` from a terminal with `--approval tty`, or keep the default and know
approval-required actions safely **deny** when no human can be asked. Executed actions are signed
into `$TMPDIR/kriya-audit.jsonl` (override with `--audit-log`).

## License boundary

ReinaManager is **AGPL-3.0**; this folder and the `kriya_exec` binary are in-repo and under the same
license. `kriya-mcp` runs as a **separate process** over the stdio JSON pipe (never linked in, and no
ReinaManager code is vendored into `kriya-mcp`), so the boundary stays at the executor.
