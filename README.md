# School

School is a Japanese-first AI mentor platform for turning a learner's goal into a practical workspace: hearing, goal tree, milestones, next actions, and focused lessons.

The project is built around a simple product position: AI coding and creation tools are powerful, but learners often lose continuity between sessions. School keeps the goal, context, plan, lesson matches, and mentor memory together so the next interaction starts from the learner's current state instead of from a blank chat.

## Status

School is an active early-stage OSS project. The current codebase is useful for local exploration, architecture review, and contribution to the goal-first mentor workflow. Hosted production deployments require maintainer-managed Supabase, analytics, email, and model-provider credentials.

## What It Does

- Captures a learner goal through an onboarding/hearing flow.
- Builds a goal tree first, then derives milestones and next actions.
- Matches actions to lesson atoms instead of forcing a fixed course path.
- Keeps mentor memory and decision context for later sessions.
- Supports model-provider routing and BYOK-oriented API key storage for future provider expansion.
- Includes a lesson factory and evaluation datasets for improving lesson coverage.

## Architecture

```text
apps/
  web/          Learner-facing Next.js app
  admin/        Admin dashboard
lesson-factory/ Lesson atom authoring, validation, and sync tooling
packages/
  goal-action/  Goal normalization, matching, gaps, bridge, judge, coverage
  ui/           Shared UI primitives
  database/     Shared database types
  ai-pr-worker/ Experimental AI-assisted maintenance worker
docs/           Architecture, runbooks, ADRs, and product notes
eval-datasets/  Small evaluation datasets for goal/action matching
```

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Turborepo
- pnpm
- Vitest and Playwright

## Local Development

Prerequisites:

- Node.js 20 or newer
- pnpm 10.17.0 or newer
- Docker, if you want to run the local Supabase stack

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Start the apps:

```bash
pnpm dev
```

Or run a single app:

```bash
pnpm dev:web
pnpm dev:admin
```

Common checks:

```bash
pnpm build
pnpm test
pnpm lint
pnpm test:swarm-scripts
```

The maintainer's full local verification flow is:

```bash
bash scripts/ci/local-verify.sh
```

## Environment Variables

`.env.example` documents the supported variables. For local exploration, most external integrations can be left blank and the product will use local or graceful fallback paths where implemented.

Production deployments need real values for Supabase, admin authorization, model providers, observability, email, scheduler auth, and distributed rate limiting.

Never commit `.env.local`, provider API keys, Supabase service role keys, Vercel tokens, or generated production configuration.

## Documentation

Useful entry points:

- [Product vision](docs/product-vision.md)
- [Goal-first learning OS architecture](docs/architecture/goal-first-learning-os.md)
- [Unified mentor architecture](docs/architecture/unified-mentor.md)
- [Curriculum architecture](docs/curriculum/curriculum-architecture.md)
- [Lesson authoring guide](docs/curriculum/lesson-authoring-guide.md)
- [BYOK key rotation](docs/byok-key-rotation.md)
- [Public release checklist](docs/public-release-checklist.md)

## Contributing

Contributions are welcome after the public repository is opened. Start with [CONTRIBUTING.md](CONTRIBUTING.md), run the relevant checks before opening a pull request, and keep changes scoped to one product or architecture concern at a time.

## Security

Please do not open public issues for suspected vulnerabilities or leaked secrets. Follow [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
