# Lazy ROM Pokémon Selector

## Goal

Make importing a Pokémon Stadium ROM immediately usable by avoiding the current
all-151-model extraction. After the ROM is validated, the user chooses a
Pokémon and only that model is built.

## User experience

- Importing a supported ROM validates the ROM and opens a selector containing
  Pokémon 001 through 151.
- Each selector card shows the National Pokédex number, canonical Gen 1 name,
  and the matching SpriteCollab `Idle-Anim.png` image from the numbered
  `sprite/NNNN/` path.
- Images load lazily. A failed image request uses a neutral placeholder with
  the Pokémon number and name still visible.
- No Pokémon model is built automatically during ROM import. Selecting a card
  displays a loading state while that one model is extracted.
- The ROM worker remains alive for the session. Built DSM packs are cached, so
  selecting a previously loaded Pokémon does not rebuild it.
- Build failures leave the selector available and show the error without
  discarding the validated ROM session.
- Existing direct DSM/PVDZ loading remains unchanged.

## Architecture and data flow

1. `importStadiumRom` creates a module worker and sends the ROM bytes.
2. The worker opens the ROM, verifies that it contains at least the 151 Stadium
   model entries, and sends a `ready` response with the available species
   numbers. It does not call `StadiumBuild.job`.
3. The React app creates an `ImportedSession` containing the worker handle,
   available model metadata, and a client-side cache of completed packs.
4. Selecting a card sends a `build` request for that species. The worker calls
   `StadiumBuild.species` for the matching archive entry and returns one DSM
   buffer.
5. The app parses that buffer, displays it in the existing inspector, and
   stores it in the session cache.
6. Loading another file terminates the old worker and clears the ROM session.

The worker protocol will use request IDs so only the response for the active
selection updates the UI. One build runs at a time per worker; this keeps the
Lua state and ROM ownership simple and prevents stale selections from
overwriting a newer one.

## Sprite data

The selector uses the public SpriteCollab repository image pattern:

`https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/NNNN/Idle-Anim.png`

where `NNNN` is the four-digit National Pokédex number. The app will include a
small attribution link to the SpriteCollab repository and will not bundle or
modify those images.

## Tests and verification

- Unit-test the Gen 1 species metadata and sprite URL formatting.
- Test the worker-facing import seam with a mocked worker: ROM import resolves
  with 151 selectable species, a build request returns one pack, and repeated
  selection can use the session cache.
- Update the production self-test to validate ROM readiness and build several
  representative species (including 001, 025, and 151), rather than requiring
  all 151 packs to be built in one run.
- Run the existing test suite and production build.
- Run the ROM self-test against the supplied USA ROM.

## Scope boundaries

- No parallel extraction or background prefetching in this change.
- No search, filtering, alternate forms, or additional generations.
- No server-side ROM upload; all ROM bytes remain in the browser worker.
