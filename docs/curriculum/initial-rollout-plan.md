# Initial Rollout Plan

## Objective

Launch the first curriculum system for School with enough fidelity to:

- author the first web-builder track
- support future AI lesson sequencing
- start implementation in content, admin, and learner product surfaces

## Scope For Initial Rollout

Included:

- curriculum architecture spec
- v1 metadata schema for lesson chunks
- first-pass track outline
- initial authoring template and dependency rules
- rollout plan for content and implementation teams

Not included:

- final database migrations
- production recommendation engine
- full learner progress analytics

## Eight-Week Schedule

### Week 1: Lock The System

- approve the curriculum architecture
- confirm naming conventions for tracks, modules, lessons, and tags
- define the canonical lesson template from the authoring contract

Exit criteria:

- architecture is accepted as the source of truth
- content team and implementation team agree on object model

### Week 2: Model The Content Layer

- map the metadata schema into the current admin/content model
- identify missing fields in existing course and lesson entities
- define how support assets and dependencies should be stored

Exit criteria:

- implementation-ready schema proposal exists
- open questions are reduced to product decisions, not architecture gaps

### Week 3: Author The Skeleton Track

- create all lesson records for the web-builder track
- attach prerequisites, tags, estimated times, and milestone mapping
- write stub summaries and promises for every lesson

Exit criteria:

- the entire track exists structurally even if lesson bodies are incomplete

### Week 4: Build The First High-Value Lessons

- fully author the first 6 to 8 core lessons
- create shared support assets for setup, Git basics, and deployment troubleshooting
- validate lesson granularity by running an internal dry run

Exit criteria:

- a beginner can reach a meaningful build state without major missing steps

### Week 5: Extend Through Deployment

- author Supabase integration and deployment lessons
- create the capstone launch checklist
- define evidence of completion for graduation

Exit criteria:

- the track can carry a learner from project start to live URL

### Week 6: Implement Sequencing Foundations

- build or specify retrieval queries using tags, prerequisites, and learner state
- implement a simple sequencing mode:
  - guided path first
- define skip rules for learners with existing projects or prior experience

Exit criteria:

- the system can produce a short explainable lesson sequence

### Week 7: Internal Pilot

- run 3 to 5 internal or friendly-user pilots
- collect where learners stall, skip, or need remediation
- revise lesson dependencies and support assets

Exit criteria:

- top blockers are known
- the architecture survives real usage without major restructuring

### Week 8: Launch Readiness

- finalize first release lessons
- prepare admin workflows for ongoing lesson creation
- define the next persona or adjacent track to prove reusability

Exit criteria:

- first track is launchable
- expansion path is documented

## Pragmatic Team Execution Plan

Keep the team lean. Four workstreams are enough.

### 1. Curriculum Lead

Owner:

- architecture quality
- lesson granularity
- prerequisite graph integrity
- graduation criteria

Deliverables:

- final spec
- lesson inventory
- quality bar for authoring

### 2. Content Author

Owner:

- lesson bodies
- support assets
- examples, checkpoints, and troubleshooting

Deliverables:

- complete lesson pages
- reusable support materials

### 3. Product/Platform Engineer

Owner:

- content model changes
- admin support for metadata and dependencies
- lesson retrieval and sequencing primitives

Deliverables:

- schema implementation
- admin entry flow
- sequencing integration hooks

### 4. Reviewer / Pilot Operator

Owner:

- dry runs
- learner feedback capture
- issue prioritization

Deliverables:

- pilot notes
- blockers list
- recommendations for lesson splits or merges

## Multi-Agent Plan

If work is split across agents or teammates, use this boundary:

### Agent A: Architecture And Taxonomy

- owns tags, metadata schema, dependency rules, and authoring contract

### Agent B: Track Design

- owns module map, lesson inventory, milestone design, and graduation rubric

### Agent C: Implementation Mapping

- owns translation from curriculum spec into existing course/lesson/admin models

### Agent D: Content Pilot

- owns test runs of the first authored lessons and reports missing assumptions

This split is useful because each area can progress in parallel with low merge risk. It should only be used if the team is actually staffed for parallel work. Otherwise one curriculum lead and one engineer is sufficient for v1.

## Immediate Next Actions

1. Accept this spec set as the baseline.
2. Convert the metadata schema into concrete application entities.
3. Create lesson records for the full web-builder track before polishing individual lesson prose.
4. Author the first authoring batch and run an internal pilot before expanding breadth.
