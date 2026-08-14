# Lazy ROM Pokémon Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import the Stadium ROM quickly, choose one of Pokémon 001–151 using SpriteCollab images, and build only the selected model.

**Architecture:** Keep ROM import in a persistent module worker. The worker opens and validates the ROM once, answers `build` requests for individual species, and returns one DSM buffer per request. The React app owns the session cache and presents a lazy-loading card grid before the existing inspector view.

**Tech Stack:** React 19, TypeScript, Vite module workers, Fengari Lua runtime, Vitest, CSS, SpriteCollab images loaded from raw GitHub URLs.

## Global Constraints

- Build only the selected model; do not pre-extract all 151 models.
- Keep ROM bytes in the browser worker; never upload them.
- Use `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/NNNN/Idle-Anim.png` for selector images.
- Preserve direct DSM/PVDZ importing.
- Do not modify unrelated pre-existing working-tree edits.

---

### Task 1: Add Gen 1 Pokémon metadata and sprite URL boundary

**Files:**
- Create: `src/pokemon.ts`
- Create: `src/pokemon.test.ts`

**Interfaces:**
- Produces `GEN1_POKEMON: readonly { species: number; name: string }[]` with exactly the canonical 001–151 list.
- Produces `pokemonName(species: number): string` with `#NNN` fallback text for out-of-range IDs.
- Produces `pokemonSpriteUrl(species: number): string` using four-digit padding and `Idle-Anim.png`.

- [ ] **Step 1: Write failing metadata and URL tests.**

  Test exact length and boundary names:

  ```ts
  expect(GEN1_POKEMON).toHaveLength(151);
  expect(GEN1_POKEMON[0]).toEqual({ species: 1, name: "Bulbasaur" });
  expect(GEN1_POKEMON[150]).toEqual({ species: 151, name: "Mew" });
  expect(pokemonSpriteUrl(1)).toBe(
    "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/0001/Idle-Anim.png",
  );
  expect(pokemonSpriteUrl(151)).toContain("/0151/Idle-Anim.png");
  ```

- [ ] **Step 2: Run the focused test and confirm it fails because the module is absent.**

  Run: `npm test -- src/pokemon.test.ts`

- [ ] **Step 3: Add the 151 canonical names, metadata lookup, and URL formatter.**

  Keep the data ordered by National Pokédex number; do not fetch metadata at runtime.

- [ ] **Step 4: Run the focused test and confirm it passes.**

  Run: `npm test -- src/pokemon.test.ts`

- [ ] **Step 5: Commit the metadata slice.**

  ```bash
  git add src/pokemon.ts src/pokemon.test.ts
  git commit -m "Add Gen 1 Pokemon selector metadata"
  ```

### Task 2: Make the ROM worker validate once and build one species on demand

**Files:**
- Modify: `src/romWorker.ts`
- Modify: `src/vendor/stadium/StadiumBuild.lua:680-704` only if the direct species entry needs a small compatibility adjustment
- Modify: `scripts/rom-self-test.mjs`

**Interfaces:**
- Consumes worker messages `{ type: "open"; bytes: ArrayBuffer }` and `{ type: "build"; requestId: number; species: number }`.
- Produces `{ type: "ready"; species: number[] }`, `{ type: "built"; requestId; species; bytes }`, and request-scoped `{ type: "error"; requestId?; message }`.
- The worker retains the ROM runtime between messages and never runs the 151-model job during `open`.

- [ ] **Step 1: Add a direct single-species Lua invocation in the worker harness.**

  The Lua initialization must open `ROM_BYTES`, reject ROMs with fewer than `StadiumRom.N_POKEMON` models, and define a callable `V.build(species)` that invokes `StadiumBuild.species(rom, species - 1)` and forwards the returned DSM bytes through `V.write`.

- [ ] **Step 2: Add worker message handling for `open` and `build`.**

  On `open`, create the Fengari runtime and post `ready` with `[1, 2, ..., 151]`. On `build`, reject missing or invalid species, call the cached runtime, and transfer the returned DSM buffer. Clear the Lua stack after errors so a failed build does not poison the next request.

- [ ] **Step 3: Update the self-test to exercise the new protocol.**

  The test must open the supplied ROM, assert the ready list has 151 entries, then build species 1, 25, and 151 and assert each response is `built`, has the requested species, and starts with `DSM3`.

- [ ] **Step 4: Run the production self-test and verify it no longer waits for all 151 packs.**

  Run: `npm run build && npm run self-test -- '/Users/shanemcgovern/Pokemon Stadium (USA).z64'`

- [ ] **Step 5: Commit the worker slice.**

  ```bash
  git add src/romWorker.ts scripts/rom-self-test.mjs
  git commit -m "Build Stadium ROM models on demand"
  ```

### Task 3: Add a persistent imported session and DSM cache

**Files:**
- Modify: `src/romImport.ts`
- Modify: `src/romImport.test.ts`

**Interfaces:**
- `ImportedSession` remains the public app-facing `{ sessionId, models }` shape.
- `fetchImportedModel(sessionId, species)` requests a missing species from the session worker and returns a copied `ArrayBuffer`; cached species return without a worker request.
- Produces `closeImportedSession(sessionId): void` for App cleanup.

- [ ] **Step 1: Extend the fake-worker test seam.**

  Add a deterministic mocked `Worker` that responds to `open` with 151 species and responds to `build` with a minimal DSM buffer. Assert import resolves immediately with 151 models, the first fetch sends one build request, and a second fetch for the same species does not send another request.

- [ ] **Step 2: Run the focused test and confirm the new session behavior fails.**

  Run: `npm test -- src/romImport.test.ts`

- [ ] **Step 3: Refactor `romImport.ts` to retain the worker per session.**

  Resolve `importStadiumRom` on `ready` instead of `done`; route `built` and request-scoped errors through a pending-request map; store completed buffers in the session cache; terminate the worker from `closeImportedSession`.

- [ ] **Step 4: Run the focused test and confirm it passes.**

  Run: `npm test -- src/romImport.test.ts`

- [ ] **Step 5: Commit the session slice.**

  ```bash
  git add src/romImport.ts src/romImport.test.ts
  git commit -m "Cache lazily imported Stadium models"
  ```

### Task 4: Build the Pokémon selector UI and connect lazy loading

**Files:**
- Create: `src/PokemonSelector.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `PokemonSelector` accepts `models`, `selectedSpecies`, `loadingSpecies`, and `onSelect(species)`.
- The component renders one keyboard-accessible button per available species, a lazy SpriteCollab image, the number/name, and a placeholder on image failure.

- [ ] **Step 1: Add the selector component with a local image-error state.**

  Use `<img loading="lazy" src={pokemonSpriteUrl(species)} alt={`${name} sprite`} />`; after `onError`, render the card number/name without retrying the broken image.

- [ ] **Step 2: Add selector CSS and responsive grid behavior.**

  Use a scrollable grid sized for 151 cards, clear selected/loading states, and a small attribution link to SpriteCollab. At mobile widths, reduce card columns without hiding any entries.

- [ ] **Step 3: Change App ROM flow to keep the selector visible after `ready`.**

  Do not auto-load the first model. While no model is loaded but `romSession` exists, render the selector screen. Selecting a card calls `fetchImportedModel`, parses it with `parseDsm`, and then enters the existing inspector. Preserve the sidebar dropdown for switching among imported models after a model is open.

- [ ] **Step 4: Terminate old sessions on new-file load and preserve errors in the selector.**

  Call `closeImportedSession` before dropping or replacing a ROM session. If a selected model fails to build, keep the 151-card selector and show the error instead of returning to the initial file-drop screen.

- [ ] **Step 5: Run the full typecheck/build and inspect the selector in the dev server.**

  Run: `npm test && npm run build`

  Then run: `npm run dev -- --host 127.0.0.1`, import the supplied ROM, confirm the selector appears before model extraction, select Bulbasaur and Mew, and confirm revisiting Bulbasaur uses the cached pack.

- [ ] **Step 6: Commit the UI slice.**

  ```bash
  git add src/PokemonSelector.tsx src/App.tsx src/styles.css
  git commit -m "Add lazy Pokemon selector for ROM imports"
  ```

### Task 5: Final integration verification and deployment handoff

**Files:**
- Modify: `README.md` only if the import instructions still describe eager extraction

- [ ] **Step 1: Run all automated checks.**

  ```bash
  npm test
  npm run build
  npm run self-test -- '/Users/shanemcgovern/Pokemon Stadium (USA).z64'
  ```

- [ ] **Step 2: Check the diff and ensure no debug instrumentation remains.**

  Run: `git diff --check && rg -n "DEBUG-|console\.log\(" src scripts || true`

- [ ] **Step 3: Verify the hosted flow after deployment.**

  Open the GitHub Pages build, hard-refresh, import the supplied ROM, verify that the selector appears promptly, select at least two species, and verify the selector images either load or fall back without blocking model extraction.

- [ ] **Step 4: Commit any README wording update and report the hosted URL.**

  ```bash
  git add README.md
  git commit -m "Document lazy Stadium ROM model loading"
  ```
