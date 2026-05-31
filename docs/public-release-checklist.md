# Public Release Checklist

Use this checklist before making School public or before exporting a clean public repository.

## Recommended Publishing Path

Do not simply flip the current private repository to public until the full Git history has been audited. This repository contains internal agent work logs, deployment runbooks, and historical audit artifacts. Deleting files in the latest commit is not enough because public GitHub repositories expose history.

Recommended path:

1. Create a clean public repository from a sanitized export.
2. Start with a single initial commit or a rewritten history that excludes internal artifacts.
3. Keep the private repository as the maintainer workspace.
4. Push future public-safe changes from the clean public branch/export.

## Must Pass Before Public

- [ ] No real secrets in the working tree.
- [ ] No real secrets in Git history, or history is replaced with a clean initial commit.
- [ ] `.env.example` contains names and placeholders only.
- [ ] `LICENSE` is present.
- [ ] `README.md` describes local setup, status, architecture, and security expectations.
- [ ] `CONTRIBUTING.md` is present.
- [ ] `SECURITY.md` is present.
- [ ] Production deployment workflows are manual-only or removed from the public export.
- [ ] Internal task queues, agent work logs, private mission docs, production run logs, and raw audit artifacts are excluded from the public export.
- [ ] Maintainer email addresses, customer data, private domains, and screenshots are reviewed.

## Suggested Exclusions For Clean Public Export

Exclude these from the initial public repository unless they are reviewed and intentionally kept:

- `.agent-work/`
- `.claude/`
- `reports/`
- `CURRENT_MISSION.md`
- `MEMORY.md`
- `TASK_QUEUE.md`
- `TASK_QUEUE_ARCHIVE.md`
- `TASKS.md`
- private deployment notes
- raw production smoke-test output
- local or generated debug artifacts

## Public-Friendly Files To Keep

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.env.example`
- `.gitignore`
- `apps/`
- `packages/`
- `lesson-factory/`
- `docs/architecture/`
- `docs/curriculum/`
- `docs/adr/`
- `docs/byok-key-rotation.md`
- `eval-datasets/`
- `scripts/`
- package and workspace config files

## Secret Scan Commands

Working tree scan:

```bash
rg --hidden --glob '!node_modules' --glob '!.git' --glob '!pnpm-lock.yaml' --glob '!package-lock.json' -n \
  '(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY=\S+|OPENAI_API_KEY=\S+|ANTHROPIC_API_KEY=\S+|GEMINI_API_KEY=\S+)'
```

History scan:

```bash
git log --all --name-only --pretty=format:'COMMIT %h %s' --regexp-ignore-case -G \
  '(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY=[^<[:space:]][^[:space:]]+|OPENAI_API_KEY=[^<[:space:]][^[:space:]]+|ANTHROPIC_API_KEY=[^<[:space:]][^[:space:]]+|GEMINI_API_KEY=[^<[:space:]][^[:space:]]+)'
```

These commands are guardrails, not a formal guarantee. Use a dedicated secret scanning tool before publishing.
