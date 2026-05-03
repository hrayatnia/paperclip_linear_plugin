# paperclip-plugin-linear

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that syncs [Linear](https://linear.app) tickets in and out on a cron schedule.

- **Linear → Paperclip:** every ~5 minutes, fetch updated Linear issues and mirror them as Paperclip issues assigned to a configured handler agent.
- **Paperclip → Linear:** when the agent updates the mirrored issue or adds a comment, push the change back to Linear.

## Quick install

```bash
npm install
npm run build
npm test
```

For operator install into a Paperclip instance, see the [Paperclip plugin docs](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md).

## Configuration

Plugin settings (set via Paperclip's plugin settings UI):

| Key | Type | Description |
|---|---|---|
| `linear.teamKey` | string | Linear team key (e.g. `ENG`). |
| `linear.issueFilter` | object | Optional Linear API filter (e.g. `{ state: { name: { eq: "Todo" } } }`). |
| `paperclip.defaultProjectId` | string (uuid) | Paperclip project to create mirrored issues in. |
| `paperclip.defaultAgentId` | string (uuid) | Agent to assign each mirrored issue to. |
| `cronSchedule` | string | 5-field cron expression. Default `*/5 * * * *`. |
| `syncEnabled` | boolean | Master kill-switch. Default `true`. |

Plugin secrets:

| Key | Description |
|---|---|
| `linear.apiKey` | Linear personal API key. Generate at https://linear.app/settings/api. |

## Project layout

```
src/
  manifest.ts        # PaperclipPluginManifestV1: jobs, capabilities, config schema
  worker.ts          # definePlugin: cron handler + event subscriptions
  index.ts           # re-exports
  linear/            # @linear/sdk wrapper (W1)
  state/             # ctx.state mapping + cursor (W2)
  sync/
    pull.ts          # cron handler (W3)
    push.ts          # event handlers (W4)
  __tests__/         # smoke tests
```

## Development

- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — emits `dist/`
- `npm test` — vitest

## Links

- [Linear TypeScript SDK](https://linear.app/developers/sdk) — `@linear/sdk`
- [Paperclip docs](https://docs.paperclip.ing)
- [Paperclip plugin spec](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md)
- [Paperclip plugin SDK](https://github.com/paperclipai/paperclip/tree/master/packages/plugins/sdk) — `@paperclipai/plugin-sdk`

## License

MIT — see [LICENSE](./LICENSE).
