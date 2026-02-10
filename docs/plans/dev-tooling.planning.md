# Dev Tooling -- Planning Context

Covers: Diagram generation (`generate-diagrams.mjs`), architecture validation (`validate-architecture.mjs`), pre-commit hook, ARCHITECTURE.md, and npm scripts.

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> also, i've found that call/class diagrams are super helpful for ensuring new claudes are able to easily drop in, understand a project, and contribute. any ways to do something like that with client-side javascript?
-- Source: user, second message in conversation (requesting diagram tooling)

> so i actually *love* deterministically generated diagrams. for my first/second AI-assisted go project, i ended up with:
>
> * a git commit hook that generates class/call diagrams saved to a temporary location
> * compares those previously-generated diagrams to see what the diff is
> * finds any modified objects (class/function signatures or types or whatever)
> * tells claude what was changed and shows all connected pieces (i.e.: you changed *this*, *this* uses / is used by *these*, ensure that the change to *this* fits with *these*)
> * asks claude to ensure the updated diagrams don't include dead ends or unused nodes
> * if there is a diff, blocks the commit until a prose ARCHITECTURE.md is updated and added to the commit
>
> i can't stress how helpful this has been to keeping things clean and well documented in a way that *seems* to strongly help human and AI developers alike. i'd love to try and replicate it everywhere lol, but it strongly depends on the language in question supporting deterministically generated class/call diagrams, and i've not looked into what that looks like for different languages
-- Source: user, describing the Go project workflow they want to replicate

> 6. i'm honestly good with this. my priority is the pages for now. once the first 3-4 are good, i'll focus on getting the dev tooling up to spec :)
-- Source: user, deprioritizing dev tooling relative to the scene pages (in response to Claude noting that Tasks 14-15 are less detailed than scene tasks)

### User-Confirmed Designs

Full replication selected:

> For the diagram/commit-hook system, what scope do you want for this project?
Claude proposed: "Full replication (Recommended) -- dependency-cruiser for module graph + custom acorn script for class/function extraction. Deterministic Mermaid output. Pre-commit hook that diffs diagrams, reports connected changes, checks for dead ends, blocks if ARCHITECTURE.md isn't updated. Full workflow you described."
-- Source: Claude question, confirmed by user selecting "Full replication (Recommended)"

Node dev dependency approved:

> The commit hook + dependency-cruiser + acorn means we need npm/node as a dev dependency (not for the site itself, just for the tooling). The site stays pure static ES modules with zero build step. Node is only used for: generating diagrams, running the commit hook, and linting. Cool?
-- Source: Claude question, confirmed by user selecting "Yes, node for dev tooling is fine"

Commit hook design confirmed:

> git commit
>   |
>   +-- generate-diagrams.mjs
>   |   +-- parse all .js -> produce .mmd files
>   |
>   +-- validate-architecture.mjs
>   |   +-- diff .mmd files against committed versions
>   |   +-- if no diff -> pass
>   |   +-- if diff:
>   |       +-- report changed nodes + connected pieces
>   |       +-- check for dead ends / orphans
>   |       +-- if ARCHITECTURE.md is staged -> pass
>   |       +-- if ARCHITECTURE.md NOT staged -> block
>   |           +-- print: "Architecture changed. Update ARCHITECTURE.md
>   |                      and stage it, or run: npm run update-docs"
>   |
>   +-- stage updated .mmd files automatically
-- Source: Claude design, confirmed by user with "looks good! :D"

Full file inventory confirmed including tools:

> tools/                                       # Dev tooling (not served by GitHub Pages)
> +-- generate-diagrams.mjs                   # AST parser -> Mermaid output
> +-- validate-architecture.mjs               # Diff diagrams, find dead ends, gate commits
>
> package.json                                 # devDependencies: acorn, dependency-cruiser
> .githooks/
> +-- pre-commit                              # Runs diagram validation
-- Source: Claude, full file inventory section, confirmed by user with "let's do it :)"

### Claude Specifications (Uncontradicted)

Diagram generation approach:

> Uses **acorn** to parse every `.js` file and extract:
>
> - **Module graph** -- which file imports what (import statements -> edges)
> - **Class graph** -- class names, method signatures, extends relationships
> - **Export graph** -- what each module exports (functions, classes, constants)
>
> Outputs two Mermaid files to `docs/3d/diagrams/`:
>
> ```
> docs/3d/diagrams/
> +-- module-dependencies.mmd    # file-level import/export graph
> +-- class-hierarchy.mmd        # class relationships + key methods
> ```
>
> These are deterministic -- same source always produces same output, so `git diff` on them is meaningful.
-- Source: Claude, commit hook design section

npm scripts:

> ```json
> {
>   "scripts": {
>     "diagrams": "node tools/generate-diagrams.mjs",
>     "validate": "node tools/validate-architecture.mjs",
>     "update-docs": "npm run diagrams && echo 'Now update ARCHITECTURE.md prose'"
>   }
> }
> ```
-- Source: Claude, both in the design conversation and the design doc

Validation report format:

> Architecture changed:
>
> MODIFIED: lib/core/scene.js
>   - Added method: SceneManager.pause()
>   - Connected modules:
>     - scenes/line-walker/main.js (imports SceneManager)
>     - scenes/lorenz/main.js (imports SceneManager)
>     ...
>
> NEW: lib/utils/particle.js
>   - No consumers yet (dead end)
-- Source: Claude, Task 14 of implementation plan

Tech stack note (amended):

> **Tech Stack:** Three.js r0.182.0, lil-gui 0.21.0, ES modules (no build step), acorn (dev tooling only)
-- Source: Claude, implementation plan header. Note: the original plan listed `dependency-cruiser` as a dev dependency, but the final plan uses only `acorn` and `acorn-walk`. The design doc mentions `dependency-cruiser` in the conversation but the implementation plan devDependencies list only `acorn` and `acorn-walk` in package.json.

Pre-commit hook details:

> ```bash
> #!/usr/bin/env bash
> # Only run if JS files under docs/3d/ changed
> CHANGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^docs/3d/.*\.js$')
> if [ -z "$CHANGED" ]; then
>     exit 0
> fi
>
> echo "Validating architecture diagrams..."
> node tools/validate-architecture.mjs
>
> if [ $? -ne 0 ]; then
>     echo ""
>     echo "Commit blocked: architecture diagrams are out of date."
>     echo "Run 'npm run update-docs' then update ARCHITECTURE.md and stage both."
>     exit 1
> fi
>
> # Auto-stage updated diagram files
> git add docs/3d/diagrams/*.mmd
> ```
-- Source: Claude, Task 14 Step 4

## Alignment with Design Doc

The design doc (Sections "Dev Tooling", lines 251-296) describes:
- Diagram generation using acorn to parse JS files
- Module dependency graph and class hierarchy graph output as Mermaid .mmd files
- Architecture validation that diffs generated diagrams against committed versions
- Pre-commit hook flow: generate -> diff -> if changed, require ARCHITECTURE.md staged
- npm scripts for diagrams, validate, update-docs

## Alignment with Implementation Plan

Task 14 covers all dev tooling:
- Step 1: Install acorn + acorn-walk dev dependencies
- Step 2: Diagram generation (described at high level -- what to extract, output format)
- Step 3: Validation (described at high level -- diff logic, connected nodes, dead end detection)
- Step 4: Pre-commit hook (complete bash script provided)
- Step 5: Git hooks configuration
- Step 6: Testing steps
- Step 7: Commit

Task 15 covers ARCHITECTURE.md and index page updates.

## Gaps or Concerns

1. **Dev tooling is intentionally low-priority** -- The user explicitly said "my priority is the pages for now. once the first 3-4 are good, i'll focus on getting the dev tooling up to spec." This means Tasks 14-15 should be implemented last and the user expects to iterate on them.

2. **generate-diagrams.mjs lacks complete code** -- The implementation plan describes what the script should do but does not provide implementation code. This is a ~200-300 line AST-walking script that needs to handle: finding all JS files, parsing with acorn, extracting import declarations, class declarations with methods, export declarations, extends clauses, and outputting deterministic Mermaid. The implementer will need significant domain knowledge of acorn's AST format.

3. **validate-architecture.mjs lacks complete code** -- Similar to above, described but not implemented. Needs to: run diagram generation, diff against committed versions, parse the graph to find connected nodes, detect dead ends/orphans, check git staging for ARCHITECTURE.md.

4. **dependency-cruiser mentioned but not used** -- The conversation mentions `dependency-cruiser` as a potential tool, and the original design doc listed it as a dev dependency. However, the final implementation plan's package.json only lists `acorn` and `acorn-walk`. The implementation plan tech stack line was amended to remove `dependency-cruiser`. The custom acorn script approach replaces dependency-cruiser entirely.

5. **"tells claude what was changed"** -- The user's Go workflow includes a step where the tool "tells claude what was changed and shows all connected pieces." The validation script outputs a report to stdout about what changed, but does not explicitly invoke Claude for review. The commit hook blocks until ARCHITECTURE.md is updated, which implicitly requires a human or AI to review the changes. This matches the user's Go workflow where the tool provides information and the developer (human or AI) acts on it.

6. **ARCHITECTURE.md format** -- The implementation plan says to "embed the generated Mermaid diagrams inline" using ```mermaid code blocks. It also mentions `<!-- include: diagrams/module-dependencies.mmd -->` markers in the design conversation but this was simplified in the final plan to direct copying from .mmd files.

## Implementation Guidance

- Start with Task 14 only after all four scenes and AutoCamera are complete (Tasks 1-13).
- The user expects to iterate on dev tooling, so a working-but-imperfect first version is acceptable.
- Use `acorn` (ecmaVersion 2022, sourceType 'module') and `acorn-walk` for AST traversal.
- Output must be deterministic: sort all nodes and edges alphabetically before writing .mmd files.
- The pre-commit hook only runs when JS files under `docs/` are modified (filtered by `git diff --cached`).
- `git config core.hooksPath .githooks` must be run to enable the hook.
- ARCHITECTURE.md should contain prose overview + embedded Mermaid diagrams + "How to add a new scene" section + dev tooling explanation.
