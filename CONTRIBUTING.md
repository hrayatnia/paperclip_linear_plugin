# Contributing

Thanks for your interest in `paperclip-plugin-linear`. This is a small plugin, so the contributor surface is intentionally minimal.

## Local development

```bash
git clone https://github.com/hrayatnia/paperclip_linear_plugin.git
cd paperclip_linear_plugin
npm install
npm test
```

Node 20+ is required (see `.nvmrc`). The toolchain is npm + TypeScript + Vitest; nothing else is needed locally.

## Branch naming

Use one of the following prefixes:

- `feat/` — new functionality
- `fix/` — bug fixes
- `chore/` — tooling, docs, CI, refactors

## Pull requests

- One PR per concern. If you find yourself writing two unrelated commits, open two PRs.
- Keep PRs scoped and reviewable. Update tests and docs in the same PR as the change they describe.
- Tests are required for changes under `src/`. New behaviour needs a new test; bug fixes need a regression test.
- Before pushing, run:

```bash
npm run typecheck && npm run build && npm test
```

CI runs the same three commands on every push and PR; failures will block merge.

## License

This project is MIT-licensed. By submitting a contribution you agree that your work is dual-licensed under the same MIT terms as the rest of the project.
