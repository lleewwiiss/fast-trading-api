# fast-trading-api

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Git Hooks

This project uses git hooks with [Husky](https://typicode.github.io/husky/) to ensure code quality. When you run `bun install`, the hooks will be automatically installed.

The pre-commit hook will run lint, test, and build before each commit to ensure code quality.

This project was created using `bun init` in bun v1.2.6. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
