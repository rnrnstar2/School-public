# Contributing

Thanks for helping improve School.

## Development Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Use local or placeholder credentials unless your task explicitly needs a real integration. Do not commit `.env.local`, generated Vercel config, Supabase service-role keys, provider API keys, or production data exports.

## Before Opening a Pull Request

Run the smallest checks that cover your change:

```bash
pnpm lint
pnpm test
```

For broader changes, run:

```bash
pnpm build
bash scripts/ci/local-verify.sh
```

## Contribution Guidelines

- Keep changes focused.
- Prefer existing architecture and local helper APIs over new patterns.
- Add or update tests when behavior changes.
- Update documentation when changing public setup, workflows, environment variables, or architecture.
- For AI/model features, document provider behavior, fallback behavior, cost boundaries, and privacy impact.

## Issue Scope

Good first issues include documentation improvements, local setup fixes, tests, lesson atom quality improvements, and small UI polish. Larger changes to mentor routing, BYOK, Supabase schema, or production deployment should start with an issue or design note.
