# Values, Principles & Design Guidelines (Interview-Refined)

This document captures principles derived from an interview, with context about when they apply, when they don't, and heuristics for decision-making. The goal is to build a compendium that an LLM can reference during planning to derive project-specific guidelines.

---

## Meta-Goal: The Compendium Vision

The aim is not just to document principles for one project, but to build a **compendium with context** that enables:
1. An LLM to derive project-specific principles during planning
2. Alignment between LLM implementation and human intent
3. Reduction of repeated corrections and oversight burden

**Format**: Both quantified heuristics (where possible) AND examples/case studies (to illuminate nuances not yet codified).

**The gap to fill**: Turning implicit intuition into explicit, LLM-parseable guidance. The failure mode is leaning on subjective ideals without realizing where objective, specific clarity is needed.

---

## The Cardinal Rules

### 1. One Contiguous Block

**The Principle**: To add a feature or implement a change, modifications should be contained within **one contiguous block of code** whenever possible.

**Why it matters**:
- Reduces cognitive load when making changes
- Reduces risk of missing something
- Easier to hold an internal mental model when "one concept" lives in one place
- Makes code reviewable — you can understand a feature by reading one place

**The analogy**: Finding a single giant in a crowd vs. finding multiple people with a "strongly linking trait" (like a strong jawline) that you subjectively hold as connected. If success depends on finding all of them repeatedly, that's a huge burden.

**When it applies**:
- Feature code, volatile areas, things that change frequently
- New functionality additions

**When it doesn't apply**: When following the rule adds significant complexity or forces scattering of more volatile components

**The trade-off**: Favor the rule everywhere and use it as a base. But core logic can be structured in a way that makes most sense (even if scattered) IF that structure enables future changes in volatile areas to happen in one contiguous block. Pay the cost once in infrastructure so features are cheap.

**Before implementing ANY change, verify**:
1. Is this change in one contiguous block? If not, consider refactoring first.
2. Will this change make future features require scattered modifications? If so, reconsider.

**If you must violate this rule**:
- There MUST be a documented reason supported by a core principle
- Record the reason in the commit message or PR description

---

### 2. Clarity Over Cleverness

**The Principle**: Code should be obvious, not impressive.

- Descriptive names, even if long
- Explicit function signatures
- Comments explain "why", not "what"
- Avoid one-liners that require mental parsing
- Avoid clever tricks that save 2 lines but cost understanding

**Guiding question**: "Would I understand this code in 6 months?"

**Relationship to performance**: When performance is a constraint, code should still be structured clearly:
- Explicitly named variables and functions
- Complex logic separated into clearly and simply named functions
- Optimization doesn't excuse obscurity

**When speed matters**: Favor speed where **UX is concerned**. This is project-dependent, but user-facing responsiveness is typically worth optimization effort.

---

### 3. Explicit Over Implicit

**The Principle**: Make dependencies, modes, and behaviors obvious in code.

- Function signatures show all inputs
- Dependency injection makes dependencies visible
- Enums over string literals
- No hidden state or global magic

**Anti-pattern**: Functions that secretly depend on global state or environment variables without declaring it.

**Acceptable compromise**: A `get_config()` singleton is okay IF the function signature still shows `config: Optional[Config] = None` — the dependency is declared even if there's a default.

---

## Planning & Process

### 4. Plan Thoroughly, Then Implement Correctly

**The Principle**: LLMs make both planning AND implementation fast. Use that to do both well, not to skip planning.

**This is NOT "move fast and break things"**. It's more waterfall than agile:
- Iterate fast during planning
- Get it right before implementation
- LLM time being cheap means you can afford thoroughness

**The planning process** (granularity depends on project scope):
1. Discuss overarching project goals
2. Review and establish core principles/values/design choices
3. Discuss general design and UX
4. Deep dive on core/high-impact areas (can get to file/function/line level for pieces that heavily impact overall structure)
5. Create class map or similar
6. LLM generates UX_FLOW document (end-to-end user interactions + backend logic)
7. Manual thorough review of UX_FLOW, iterate until agreed
8. Revisit core design choices after UX_FLOW exploration, loop back if needed
9. LLM creates comprehensive implementation plan (chunked for <=120k tokens, with testing notes per chunk)
10. Start implementation workflow loop

**When to plan more vs. less**:
- **Work projects**: Always plan thoroughly
- **Public-facing projects**: Heavily lean towards strong planning
- **Personal projects**: Gut check — is it easy? Is there a working example with light mods?
- **Possible metric**: Expected files/lines/classes/functions/components

### 5. Discuss Flex Points Explicitly

**The Principle**: Discussing and planning foreseeable flex points is a must for any project.

**Why**:
- Infinite flexibility for hypothetical scenarios = infinite complexity
- Zero flexibility = locked into design decisions that cause headaches later
- Balance requires explicit discussion

**What a flex point discussion looks like** (heuristics still being developed):
- UX and philosophy
- "What happens if the user does X?"
- Who is the target audience?
- Cool things we *could* do but are currently out of scope
- Where do we anticipate change?

**Format for extensibility**: Not necessarily plugins. Could be:
- A config value
- A variable with default at top of a bash script
- An interface/abstraction layer for anticipated pivots (e.g., filesystem search → database)

**The goal**: Easy extensibility where change is likely, without over-engineering for unlikely scenarios.

### 6. Refactoring Is Not Cheap for Complex Projects

**The Principle**: "LLM time is cheap" applies to implementation, not refactoring interconnected code.

**Why refactoring is costly**:
- Option A: Maintain rigid map of all connections → extra time/tokens checking even simple changes
- Option B: Miss connections → long debugging sessions → project becomes a mess again

**Preference**: Spend effort getting it right upfront with planning for the future, rather than assuming cheap refactors later.

**When "just iterate" is acceptable**:
- ONLY when intentionally implementing scaffolding for UX testing purposes
- MUST be explicitly called out and agreed upon during planning
- **CRITICAL WARNING**: LLMs tend to implement scaffolding where it's not wanted. This has required active effort to combat.

> **SCAFFOLDING RULE**: If scaffolding is ever implemented, the implementing agent **MUST** have record of **explicit, verbatim, quoted verification** from the user that scaffolding is desired. No exceptions.

---

## Resilience & Error Handling

### 7. Be Aware of State, Don't Wander Into Bad States

**The Principle**: The key rule is to ensure we (1) are aware of the current state and (2) don't wander into unexpected bad states.

**This is NOT "fail fast" or "graceful degradation" dogmatically**. It depends:

| Situation | Approach |
|-----------|----------|
| Plugin fails to load | Depends on criticality and ramifications of starting without it |
| External API fails | Log, notify, continue if possible; fail if critical |
| Validation error | Fail loudly with clear message |
| Recoverable error | Try to recover with explicit handling and messages |

**Avoid**: So much error output that it becomes noise and hard to parse.

**Not a fan of**: `set -e` in bash scripts. Prefer explicit error handling with messages and recovery attempts.

**The question to ask**: "If this fails, what's the consequence? Does the user need to know? Can we recover? Should we stop?"

---

## Code Quality

### 8. Testability as Design Constraint

**The Principle**: If it's hard to test, spend more time planning how to make it testable — don't abandon the feature, and don't abandon testing.

**Preference**: Choose frameworks/tools with testing built-in (e.g., Textual over frameworks that are harder to test for TUIs).

**"Write good tests" needs breakdown**:
- Protocols for tests during bugfix differ from protocols for coverage tests
- Context-dependent heuristics required
- This is an area where subjective ideals needed objective, specific clarity

### 9. Named Constants for Everything Configurable

**The Principle**: All magic numbers should be named constants.

**Include**: Retry counts, timeouts, thresholds, any value that might be adjusted.

**Can Skip**: Values that will never change (e.g., bytes in a megabyte) so long as they are well known (e.g., the number of seconds in a year doesn't change but is not well-known) or are highly unlikely to change.

**Unknown**: There's some threshold past which a constants file adds cognitive load, but unsure where it is, especially for LLMs.

### 10. Strict Typing

**The Principle**: Type hints on all function signatures. Pydantic/dataclass models for data structures. `from __future__ import annotations` in every module. TypeScript over JavaScript. `let -i x=1` over `x=1` in bash.

**Why**: Add clarity and catch more issues at compile/check time.

---

## Consistency & Structure

### 11. Consistency AND Flexibility (Not Consistency Over Flexibility)

**The Principle**: Have consistent rules that are followed uniformly. Those rules can evolve.

**This is NOT "pick consistency or flexibility"**:
- Consistency = following whatever the current rules are
- Flexibility = the rules themselves can change through explicit decision
- Both are valued

**Would not "break consistency"** — would change the consistent rules through explicit discussion/planning, then follow the new rules consistently.

**Note**: Rule changes should **only** occur with human planning; the reasons for the change should be documented; and heuristics should be formed that indicate when the old rule applies vs the new rule.

### 12. Async Preference (But Don't Mix)

**The Principle**: Favor async where it doesn't overcomplicate logic (e.g.: 20 extra lines to retrieve user input), but don't mix async and sync.

**Nuance**:
- CLI tools may be an exception where sync is simpler
- If a program needs *some* async, prefer the whole thing async
- Mixing is okay if components are truly separate (e.g., MCP server separate from CLI client)

---

## Working with LLMs

### 13. LLMs as Implementers, Human as Architect

**The Vision**: Shifting into an architectural role — designing systems and letting LLMs implement them fully.

**Current state**:
- ~10-15 projects with LLMs
- Building toward fully automated development with periodic check-ins
- Trying to reduce cognitive load of architectural review while maintaining alignment

**The tradeoff being assessed**:
- Iterate extensively and rapidly, then review and overhaul (or start over)
- vs. Invest in higher upfront planning cost (and still potentially overhaul as iterations reveal changes)

**Leaning toward**: More planning upfront, because LLM time makes both planning and implementation fast.

### 14. Capture Gaps Immediately

**Current state**: Fix issues in the moment, hope to remember to document. Have automated systems but they're WIP and scattered across projects.

**Ideal state**: Any gap gets a ticket immediately when noticed, addressed quickly.

**This project (ai-lessons)**: Intended to help with lesson tracking — that's the whole point.

### 15. Agent-Specific Notes

**Claude**: Good about following planning process.

**Gemini**: Tends to skip ahead to implementation; needs interruption to stay in planning phase.

**General LLM tendency**: Lean toward implementing scaffolding. Requires active effort to combat. (See scaffolding rule above.)

---

## Decision Heuristics

### When Two Valid Approaches Exist

1. Will this make the system easier to understand, extend, and maintain?
2. Am I optimizing for writing or reading? (Optimize for reading)
3. Does this add essential complexity or accidental complexity?
4. Can a new developer understand it?
5. Is this change in one contiguous block? Will it force future changes to be scattered?

### Default Positions

- Explicit over implicit
- Simple over clever
- Consistent over novel
- Tested over "obviously correct"
- Planned over "just iterate"
- Documented over "self-explanatory"

### Overhaul Triggers

When do you know it's time to overhaul?
1. Code becomes unmaintainable
2. LLM keeps making the same mistakes because structure is confusing
3. (Less common) Domain understanding has evolved significantly

---

## Summary Mantras

- **One block** — if a feature touches 5+ files, reconsider the architecture
- **Clarity** — would you understand this in 6 months?
- **State awareness** — know what state you're in, don't wander into bad states
- **Plan thoroughly** — LLM time is cheap, so do both planning AND implementation well
- **Flex points** — discuss where change is likely, don't over-engineer for unlikely scenarios
- **No surprise scaffolding** — explicit, quoted user verification required
- **Consistency evolves** — follow rules uniformly, change rules explicitly

---

## What's NOT in This Document (Yet)

Areas identified for future development:
- Heuristics for identifying flex points (currently exploratory/intuitive)
- Threshold for when constants file adds cognitive load
- Specific testing protocols by context (bugfix vs coverage vs integration)
- Metrics for "when to plan thoroughly" beyond gut check
- Coalescence of automated development system from scattered projects

---

`import this`
