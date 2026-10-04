# Implementation Checklist

[[Course/Runtime Teaching Contract]] · [[Course/Assessment & Progress Evidence]]

Implemented from the supplied overlay description; no overlay ZIP was attached or imported.

- [x] Canonical `.pi/learning-runtime.json`, mirrored by the course builder to `Course/runtime-contract.json`.
- [x] `/learn` arms the runtime; `learning_runtime` persists a session-specific contract under `.learning/runtime/`.
- [x] Real source-inspection IDs, distinct Armstrong/supplement provenance and source-grounded research before a new plan.
- [x] Per-strand floor/ceiling probing, sharper escalation, surrounding clarification and bounded course-ceiling handling.
- [x] Small goal DAG, complete strand mapping, displayed prose/Mermaid and actual subsequent learner approval.
- [x] Per-node motivate/establish/connect presentation, dependency checks and one staged actual quiz.
- [x] Direct plus fresh changed-representation evidence before new VERIFIED claims; separate error observations.
- [x] Checkpoint integration, legacy evidence preservation and exact pending-question pause/resume.
- [x] `/test-prep` from real saved weaknesses; no invented private future test details.
- [x] Every generated lesson exposes the required guide fields and runtime reference.
- [x] Displayed plans mirror into Obsidian live and on history backfill.
- [x] Existing final study-lock test and recovery rules retain authority.
- [x] Timestamped video principles drive the teach skill and live system guidance: demonstrated knowledge edge, system-owned logistics, one coherent teacher and one reasoning step at a time.
- [x] Compact runtime tool rendering and automatic context keep internal bookkeeping out of the lesson; expanded records and errors remain available.
- [x] Local-first researcher guidance avoids mandatory redundant web searches and keeps verification inside the agreed goal.

Regression commands, from the configured WSL project environment:

```bash
source work/learning-env.sh
.pi/extensions/visual-tools/node_modules/.bin/tsc -p work/tsconfig.math.json
node work/check-learning-runtime.mjs
node work/check-learning-workflow.mjs
node work/check-learning-recovery.mjs
node work/check-study-lock.mjs
node work/check-course-curriculum.mjs
node work/check-armstrong-course.mjs
```

Runtime tests use temporary vaults and synthetic submitted-attempt fixtures, never the real student's progress or microphone. They verify the guards and persistence; they do not establish that an AI reasoning judgment is mathematically correct or that a lesson taught a human successfully. Keep actual lesson evaluations honest.
