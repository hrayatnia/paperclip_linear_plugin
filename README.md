# paperclip-plugin-linear

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that syncs [Linear](https://linear.app) tickets in and out on a cron schedule.

## What it does

- Pulls updated Linear issues every five minutes and mirrors them as Paperclip issues assigned to a configured handler agent.
- Pushes Paperclip changes (status, comments, edits) back to the matching Linear issue when the agent updates the mirror.
- Runs as a Paperclip cron job — no separate process or daemon is required, only the host Paperclip instance.
- Operates bidirectionally and incrementally, using a stored cursor so each tick only processes issues changed since the previous run.

## Architecture

This is a Paperclip plugin, not a standalone cron daemon. It declares a `jobs[]` entry in its manifest so the host Paperclip instance schedules and runs the `linear-sync` job, and it uses `ctx.events` subscriptions to react to Paperclip issue/comment changes for the push direction. The plugin keeps its mapping state in `ctx.state` and reads its Linear API key from `ctx.secrets`. All scheduling, retries, and lifecycle are handled by the Paperclip host.

## Operator install

For local development:

```bash
npm install
npm run build
npm test
```

For a Paperclip instance, install the plugin with the Paperclip CLI and configure it from the admin UI:

```bash
pnpm paperclipai plugin install paperclip-plugin-linear
```

After install, open the Paperclip admin UI, set the configuration values listed below, and add the Linear API key as a plugin secret.

## Configuration

Set these values via the Paperclip admin UI under the plugin's configuration tab. They map directly to the `instanceConfigSchema` declared in `src/manifest.ts`.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `linear.teamKey` | string | yes | — | Linear team key, e.g. `ENG`. |
| `linear.issueFilter` | object | no | — | Optional Linear API filter passed verbatim to `client.issues({ filter })`. |
| `paperclip.companyId` | string (uuid) | yes | — | Paperclip company that owns the mirrored issues. |
| `paperclip.defaultProjectId` | string (uuid) | yes | — | Paperclip project to create mirrored issues in. |
| `paperclip.defaultAgentId` | string (uuid) | yes | — | Agent that handles each mirrored issue. |
| `cronSchedule` | string | no | `*/5 * * * *` | Override for the cron schedule. 5-field cron syntax. |
| `syncEnabled` | boolean | no | `true` | Master kill-switch for the cron job. |

A worked example lives at [`examples/instance-config.example.json`](./examples/instance-config.example.json).

## Secrets

| Key | Description |
|---|---|
| `linear.apiKey` | Linear personal API key. Generate one at <https://linear.app/settings/api>. |

Add the secret via the Paperclip admin UI's secrets panel — never check API keys into the configuration JSON or into git.

## Default cron schedule

The plugin ships with `*/5 * * * *` (every five minutes). Set the `cronSchedule` config value to override it; the override uses the same 5-field cron syntax.

## Mapping

Linear workflow state maps to Paperclip status:

| Linear state | Paperclip status |
|---|---|
| `Todo` | `todo` |
| `In Progress` | `in_progress` |
| `In Review` | `in_review` |
| `Done` | `done` |
| `Backlog` | `blocked` |
| _anything else_ | `todo` |

Linear priority maps to Paperclip priority:

| Linear priority | Paperclip priority |
|---|---|
| `1` (Urgent) | `critical` |
| `2` (High) | `high` |
| `3` (Medium) | `medium` |
| `4` (Low) | `low` |
| `0` (No priority) | `medium` |

## Project layout

```
src/
  manifest.ts        # PaperclipPluginManifestV1: jobs, capabilities, config schema
  worker.ts          # definePlugin: cron handler + event subscriptions
  index.ts           # re-exports
  linear/            # @linear/sdk wrapper: Linear client construction and typed accessors
  state/             # ctx.state-backed mapping store and incremental sync cursor
  sync/
    pull.ts          # cron handler: Linear -> Paperclip mirroring
    push.ts          # event handlers: Paperclip -> Linear updates
  __tests__/         # vitest suites; smoke tests pin manifest invariants
examples/
  instance-config.example.json  # sample config matching the manifest schema
.github/workflows/
  ci.yml             # typecheck + build + test on every push and PR
```

## Development

- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — emits `dist/`
- `npm test` — vitest, single run
- `npm run test:watch` — vitest in watch mode

## Local smoke test

`scripts/local-run.ts` wires the plugin's real cron handler and push handlers to a fake-host context backed by `@paperclipai/plugin-sdk/testing`. Linear API calls hit the real Linear API; Paperclip-side writes (`ctx.issues.create` / `ctx.issues.update`) are stubbed and logged so no running Paperclip instance is required.

1. Copy `.env.example` to `.env` and fill in `LINEAR_API_KEY` with a personal Linear API key from <https://linear.app/settings/api>.
2. (Optional) Override `LINEAR_TEAM_KEY`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_PROJECT_ID`, `PAPERCLIP_AGENT_ID`, or `LINEAR_ISSUE_FILTER` (JSON string) in `.env`.
3. Run one of:
   - `npm run local:sync` — invokes `runLinearSync(ctx)` once against real Linear and logs every Paperclip write that *would* happen.
   - `npm run local:sync -- --mode push` — registers the push handlers and fires synthetic `issue.updated` and `issue.comment.created` events; the plugin pushes them to real Linear.
   - `npm run local:sync -- --mode both` — pull, then push.
   - `npm run local:sync -- --limit 5` — caps Linear fetch to the first N issues.
   - `npm run local:sync -- --help` — full usage.

The runner uses `node --env-file=.env --import tsx` so no separate build step is required.

## Testing

Tests live under `src/__tests__/` and run with [Vitest](https://vitest.dev). Plugin behaviour is exercised against `@paperclipai/plugin-sdk/testing`'s [`createTestHarness`](https://github.com/paperclipai/paperclip/tree/master/packages/plugins/sdk), which provides an in-memory implementation of `ctx.jobs`, `ctx.events`, `ctx.state`, `ctx.secrets`, and `ctx.logger`. The current `smoke.test.ts` pins the manifest invariants (id, cron schedule, capabilities, required config) so changes that would break operator deployment fail loudly in CI.

## Troubleshooting

- **Sync runs but nothing happens.** Confirm `linear.apiKey` is set as a plugin secret and that `syncEnabled` is `true`.
- **`Linear team not found` errors.** The `linear.teamKey` must match the team key in Linear exactly (e.g. `ENG`, not the team's display name).
- **Mirrored issues created but no agent picks them up.** The `paperclip.defaultAgentId` must reference a registered Paperclip agent in the same instance; check the agents tab.
- **Cron didn't fire.** Verify the host Paperclip instance is running its scheduler, and that no other instance config override has set `cronSchedule` to an invalid expression.
- **Push direction not working.** The plugin needs the `events.subscribe`, `issues.update`, and `issue.comments.create` capabilities granted; check the plugin's installed capabilities in the admin UI.

## Links

- [Linear TypeScript SDK](https://linear.app/developers/sdk) — `@linear/sdk`
- [Paperclip docs](https://docs.paperclip.ing)
- [Paperclip plugin spec](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md)
- [Paperclip plugin SDK](https://github.com/paperclipai/paperclip/tree/master/packages/plugins/sdk) — `@paperclipai/plugin-sdk`
- [Linear API key page](https://linear.app/settings/api)

## License

MIT — see [LICENSE](./LICENSE).
