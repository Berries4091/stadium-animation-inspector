# Stadium Animation Inspector

Standalone React/Three.js tool for inspecting the Pokémon Stadium model packs
used by PotatoVoxel.

## Run

```sh
cd tools/stadium-animation-inspector
npm install
npm run dev
```

Open the local Vite URL, then drop a `.dsm` file into the window. The app reads
both raw `DSM3` files and the compressed `PVDZ` files written by the game.
You can also choose or drop a Pokémon Stadium US 1.0 `.z64`, `.n64`, or `.v64`
ROM. Extraction runs locally in a Web Worker using the same small Stadium
extractor modules as PotatoVoxel, builds all 151 model packs in memory, and
adds a model selector to the inspector. The ROM never leaves the browser.

On macOS, cached packs are usually in:

```text
~/Library/Application Support/pokemon-love2d/potato_voxel/stadium/
```

The inspector shows every animation clip, context-slot and move mappings, the
exact frame timeline, and a copyable report for the selected clip.

The hosted version works as a static GitHub Pages site; no server or runtime
installation is required.

## Verification

```sh
npm test
npm run build
```
