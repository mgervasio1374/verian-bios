# AI Context Recovery Pack — Verian BIOS

## Purpose

These files are the source of truth for AI context recovery in the Verian BIOS project.

After context compaction, Claude should read these files — in order — before writing any code, staging any files, or beginning any new phase.

## Recovery Protocol

1. Read all files in this folder in numerical order (00 through 07).
2. Produce a recovery summary covering:
   - Current project phase
   - Implemented agents and their status
   - Current Git milestone state
   - Active guardrails
   - Next recommended step
3. Present the recovery summary to the user.
4. Do not write code until the user approves the summary.

## When to Update These Files

Update the relevant files after:
- A major commit or commit group is pushed
- A new tag is created
- A QA milestone is verified (vitest + build)
- A phase design is locked
- A phase implementation is completed
- A guardrail changes (only with explicit user approval)

## Files in This Pack

| File | Contents |
|------|----------|
| [00_CURRENT_STATUS.md](00_CURRENT_STATUS.md) | Phase status, QA results, working tree state |
| [01_LOCKED_DECISIONS.md](01_LOCKED_DECISIONS.md) | Locked source documents and architectural decisions |
| [02_PHASE_3B_AGENT_ARCHITECTURE.md](02_PHASE_3B_AGENT_ARCHITECTURE.md) | Full Phase 3B agent pipeline architecture |
| [03_MESSAGE_STRATEGY_AGENT_SUMMARY.md](03_MESSAGE_STRATEGY_AGENT_SUMMARY.md) | Message Strategy Agent implementation summary |
| [04_COPYWRITING_AGENT_SUMMARY.md](04_COPYWRITING_AGENT_SUMMARY.md) | Copywriting Agent implementation summary |
| [05_ACTIVE_GUARDRAILS.md](05_ACTIVE_GUARDRAILS.md) | All active must-not-do boundaries |
| [06_GIT_MILESTONES.md](06_GIT_MILESTONES.md) | Commit history, tags, and QA verification log |
| [07_NEXT_STEPS.md](07_NEXT_STEPS.md) | Next approved phase and design requirements |

## Important

These files do not replace reading the actual code. They anchor context. Before making changes, verify that the documented state matches the current file system and git history.
