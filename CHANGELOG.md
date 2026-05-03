# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-03

### Added

- Initial bootstrap of `paperclip-plugin-linear`.
- Plugin manifest declaring the `linear-sync` cron job (`*/5 * * * *`), required capabilities, and instance config schema.
- Linear adapter wrapping `@linear/sdk` for issue and comment access.
- Plugin state store backing the Linear-to-Paperclip mapping and incremental cursor.
- Pull sync that mirrors updated Linear issues into Paperclip on each cron tick.
- Push sync that subscribes to Paperclip events and propagates changes back to Linear.
- GitHub Actions CI running typecheck, build, and tests on Node 20.
- Operator-facing README, example instance config, and contributor docs.

[0.1.0]: https://github.com/hrayatnia/paperclip_linear_plugin/releases/tag/v0.1.0
