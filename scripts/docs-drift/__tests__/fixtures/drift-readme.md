# Drift Fixture

Intentional drift-ridden README used exclusively by the docs-drift vitest suite.

## Structure

```
repo/
├── apps/
│   └── web/          # port: 3000
└── packages/
    ├── ghost/        # does not exist on disk
    └── ui/           # exists on disk
```

## Phase history

- 旧 `phantom-registry` は Phase 42 で完全削除済みです。
- 新しい helper (`__fixture_ghost_symbol__`) は Phase 99 で完全削除済みです。

## Ports

- web dev server: port 3000
