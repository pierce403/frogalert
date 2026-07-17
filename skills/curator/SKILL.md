---
name: curator
description: Maintain FrogAlert's repo-local skills and operating knowledge. Use when a repeated workflow or lesson may belong in AGENTS.md, MEMORY.md, SKILLS.md, agent-memory, or a new or revised repo-local skill package.
---

# Curator

Keep the knowledge system small, current, and useful to future agents.

## Workflow

1. Read `AGENTS.md`, `MEMORY.md`, `SKILLS.md`, and the candidate lesson.
2. Classify it:
   - stable project rule or safety invariant → `AGENTS.md`;
   - durable observation or dated outcome → `agent-memory/` plus `MEMORY.md`;
   - repeatable multi-step procedure → an existing or new skill;
   - product requirement/readiness change → `FEATURES.md`;
   - one-session trivia → do not retain it.
3. Prefer updating or consolidating an existing skill over adding another.
4. Keep skill bodies imperative, focused, and below 500 lines. Include only
   non-obvious procedure and validation gates.
5. Keep `SKILLS.md` metadata aligned with every live skill package.
6. Validate each changed skill with the skill-creator `quick_validate.py`.
7. Run `./scripts/verify`, record meaningful outcomes, and commit the cohesive
   knowledge update.

## Guardrails

- Never store secrets, private profiles, raw BLE observations, or irrelevant
  personal details in this public repository.
- Do not turn every successful command into a skill.
- Remove stale instructions rather than layering contradictory advice.
- Preserve `AGENTS.md` as canonical; harness aliases remain symlinks.
