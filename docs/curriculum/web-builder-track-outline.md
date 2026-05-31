# Web Builder Track Outline v1

Track ID: `web-builder-ai`  
Label: `Build and Deploy a Real Website with AI`

## Track Summary

This track helps a learner go from idea to live URL using AI as a practical build partner. The learner finishes with a deployed Next.js site using Vercel, Supabase, Tailwind CSS, and shadcn/ui.

## Target Learner Variants

- beginner with AI curiosity and limited coding background
- self-taught maker who can copy patterns but needs structure
- junior developer who wants a clean ship-to-production workflow

## Milestones

1. Define the site and MVP clearly enough to build.
2. Run the project locally with the right tools installed.
3. Build a presentable multi-page UI.
4. Connect at least one real Supabase-backed workflow.
5. Deploy to Vercel and verify a live URL.

## Module Map

### Module 1: Scope The Build

Outcome: the learner has a realistic project brief and knows what they are shipping.

Lessons:

1. Choose a site idea that fits the stack and timeline
2. Define the MVP pages and primary user flow
3. Turn the idea into an implementation checklist

### Module 2: Setup The Workspace

Outcome: the learner has a working local environment and baseline repository.

Lessons:

4. Install Node.js, pnpm, Git, and required accounts
5. Create the Next.js app
6. Publish the repository and establish version-control habits
7. Read the generated project structure without getting lost

### Module 3: Build The UI Foundation

Outcome: the learner has a styled app shell and reusable UI primitives.

Lessons:

8. Verify Tailwind CSS in the project
9. Install and configure shadcn/ui
10. Build the app shell, navigation, and layout
11. Create a homepage that communicates the product clearly
12. Build a second page from the MVP plan
13. Make the UI feel consistent with spacing, typography, and states

### Module 4: Add Real Data

Outcome: the site moves beyond static pages and uses Supabase meaningfully.

Lessons:

14. Create the Supabase project
15. Connect local environment variables safely
16. Design the first table or content model
17. Read data from Supabase inside Next.js
18. Write data back through a user-facing flow

Optional extension:

19. Add user authentication with Supabase Auth

### Module 5: Ship It

Outcome: the learner has a working production deployment.

Lessons:

20. Prepare the app for deployment
21. Configure Vercel project settings and environment variables
22. Deploy the site and diagnose the first production build
23. Verify the live URL with a launch checklist

### Module 6: Polish And Close

Outcome: the learner leaves with a cleaner project and a clear next step.

Lessons:

24. Add one polish feature with AI support
25. Write a short project handoff or build summary
26. Decide the next iteration: content, auth, or growth

## Dependency Notes

Core path:

- 1 -> 2 -> 3
- 4 -> 5 -> 6 -> 7
- 5 -> 8 -> 9 -> 10
- 10 -> 11 -> 12 -> 13
- 14 -> 15 -> 16 -> 17 -> 18
- 13 and 18 -> 20 -> 21 -> 22 -> 23
- 23 -> 24 -> 25 -> 26

Conditional path:

- 15 -> 19
- 19 is recommended before advanced dashboard or user-specific data lessons

## Recommended Metadata Tags By Module

### Module 1

- goal tags: `start-project`, `mvp-planning`
- capability tags: `scope-definition`, `workflow-planning`

### Module 2

- goal tags: `setup-environment`, `create-project`
- capability tags: `tooling-setup`, `repo-initialization`, `local-development`

### Module 3

- goal tags: `build-ui`, `improve-design`
- capability tags: `layout-building`, `component-composition`, `design-consistency`

### Module 4

- goal tags: `connect-database`, `add-backend`
- capability tags: `env-management`, `data-modeling`, `database-read`, `database-write`, `auth-basics`

### Module 5

- goal tags: `deploy-site`, `go-live`
- capability tags: `deployment`, `production-debugging`, `launch-verification`

### Module 6

- goal tags: `finish-project`, `iterate-product`
- capability tags: `polish`, `handoff`, `roadmapping`

## Suggested First Authoring Batch

If the team needs to narrow the first content release, prioritize these 12 lessons first:

1. Choose a site idea that fits the stack and timeline
2. Define the MVP pages and primary user flow
3. Create the Next.js app
4. Publish the repository and establish version-control habits
5. Install and configure shadcn/ui
6. Build the app shell, navigation, and layout
7. Create a homepage that communicates the product clearly
8. Create the Supabase project
9. Connect local environment variables safely
10. Read data from Supabase inside Next.js
11. Deploy the site and diagnose the first production build
12. Verify the live URL with a launch checklist

That subset is enough to validate the architecture and reach the promised outcome quickly.
