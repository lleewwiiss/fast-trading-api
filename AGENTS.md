# AGENTS.md

## Build, Lint, Test

- build: `bun run build` (TS -> dist/ with path aliases)
- dev/watch: `bun run dev`
- test all: `bun test`
- test single file: `bun test src/utils/chunk.utils.test.ts` (or any path)
- lint (ESLint + TS): `bun run lint`
- type-check only: `bun run lint:tsc`
- CI: see .github/workflows/run-tests.yml (runs bun test + lint)

## Code Style (ESLint/TS strict)

- Imports: 1) external 2) `~/` alias (maps to ./src) 3) relative 4) type-only last
- Formatting: Prettier via ESLint; prefer object shorthand; consistent semicolons disabled (TS default)
- Types: no implicit any; explicit return types for public APIs; narrow with guards; use readonly where applicable
- Naming: files kebab-case; classes PascalCase; vars/functions camelCase; constants SCREAMING_SNAKE_CASE; types PascalCase with `Type` suffix
- Errors: use typed errors from exchange configs; wrap/normalize provider errors; add retry/backoff for IO
- Imports hygiene: avoid default exports for libs; prefer named exports; keep side-effects out of modules
- Null-safety: prefer `unknown` over `any`; handle undefined explicitly; avoid non-null assertions

## Project Conventions

- Exchange layout: {exchange}.(exchange|worker|api|ws-private|ws-public|resolver|types|config).ts
- Architecture: worker-per-exchange, unified BaseExchange, central Store, pure utils with tests
- Release: `bash release.sh {patch|minor|major}` builds and publishes
- No Cursor or Copilot rule files present at .cursor/ or .github/copilot-instructions.md
