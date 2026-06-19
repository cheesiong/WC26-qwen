# AGENTS.md

Guidelines for reducing common AI coding mistakes. Merge with project-specific context (stack, commands, conventions) as needed.

**Tradeoff:** These guidelines bias toward caution over speed. Use judgment on trivial tasks.

---

## 1. Think Before Coding

**Don't assume. Surface confusion. Present tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask — don't guess silently.
- If multiple interpretations exist, present them. Don't pick one without saying so.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Plan First

**For any task with 3+ steps or architectural decisions:**

- Write a concise plan before touching code. Sacrifice grammar for brevity.
- End every plan with a list of unresolved questions, if any.
- Check in before starting implementation — don't just dive in.
- Give a high-level summary at each step of a multi-step task.
- If something goes sideways mid-task, STOP and re-plan. Don't keep pushing.

## 3. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 4. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style.
- If you notice unrelated dead code or issues, mention them — don't touch them.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless explicitly asked.

The test: Every changed line should trace directly to the user's request.

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform vague tasks into verifiable goals:
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Refactor X" → "Ensure all tests pass before and after"

For multi-step tasks, state a brief plan before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 6. Demand Elegance

**Before presenting non-trivial work, challenge it.**

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

## 7. Verification

**NEVER mark a task complete without proving it works.**

After every non-trivial change, run in order:
1. Type check — fix all type errors before moving on
2. Tests — fix failing tests before moving on
3. Lint — fix lint errors before moving on

Ask yourself: "Would a staff engineer approve this?" If no, fix it first.
When given a feedback loop (tests, logs, CI), use it — don't ask the user to check for you.

## 8. Autonomous Execution

- When given a bug report: fix it. Don't ask for hand-holding.
- Find root causes. No temporary fixes or symptom patches.
- Point at logs, errors, and failing tests — then resolve them without context-switching the user.
- Fix failing CI without being asked how.
- For complex tasks, use subagents liberally — offload research, exploration, and parallel analysis to keep main context clean.
- For hard problems, throw more compute at it via subagents rather than pushing through in a single context.
- One task per subagent for focused execution.

## 9. Self-Improvement

After ANY correction from the user:
- Identify the pattern behind the mistake, not just the specific instance.
- Add a concrete rule to this file that prevents recurrence.
- Each rule must answer: "Would the AI make this mistake again without this rule?"
- Ruthlessly iterate — remove rules that are obvious, add rules for patterns that repeat.

---

## Don't

- Don't commit to git without asking first.
- Don't add features, abstractions, or options that weren't requested — even "helpful" ones.
- Don't touch adjacent code that isn't broken — mention it instead.
- Don't write formatting rules here — that's what linters and formatters are for.
- Don't embed entire docs with @-mentions — instead, specify *when* to read them:
  `"For auth flows, see docs/auth-guide.md"`

---

## Product Specification

For any question about product requirements, features, or intended behavior, read `specs/SPEC.md` before implementing or answering. Do not assume product intent — check the spec first.

---

**These guidelines are working if:** clarifying questions come before implementation rather than after mistakes, diffs contain fewer unnecessary changes, and rewrites due to overcomplication drop to near zero.
