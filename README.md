# Semantic Audio Annotator

Desktop-first annotation software for the research project **Semantic Audio Search System Using Multi-Modal Embedding Representations**. The app is designed as a practical local tool for curating high-quality audio-text pairs for semantic audio retrieval experiments.

## Why this stack

- `Electron + React + TypeScript`: keeps the whole prototype in one JavaScript/TypeScript toolchain, makes local file access straightforward, and is easy for a small research team to maintain iteratively.
- `SQLite via Node's built-in node:sqlite`: robust local persistence with no server dependency, deterministic exports, and a clean setup path that avoids native addon build friction on restricted lab machines.
- `Zustand`: lightweight app state without ceremony, which fits a small internal productivity tool better than a heavier architecture.
- `Plain CSS`: keeps the UI focused, portable, and easy to tweak without introducing unnecessary styling infrastructure.

## What v1 includes

- Local manifest import from CSV or JSON
- Validation for missing files, duplicate IDs, and likely unsupported audio formats
- SQLite-backed local persistence
- Sample browser with filtering, search, progress tracking, and review queue support
- Local audio playback with play/pause, seek, restart, and loop
- Annotation form for captions, structured attributes, confidence, and review flags
- Autosave-oriented workflow and manual save controls
- Export for clean audio-text pairs and rich manifests in CSV or JSON
- Editable taxonomy configuration stored locally

## Folder structure

```text
electron/
  database/      SQLite schema and repository logic
  services/      import/export services
  main.ts        Electron main process and IPC registration
  preload.ts     secure renderer bridge
src/
  app/           global app store
  components/    reusable UI pieces
  features/      import, annotation, export, settings screens
  shared/        domain types and default taxonomy
examples/
  sample-manifest.csv
  sample-manifest.json
  taxonomy.json
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the app in development mode:

```bash
npm run dev
```

3. Build renderer and Electron code:

```bash
npm run build
```

4. Create a Windows package:

```bash
npm run package
```

## Usage

1. Open the app and go to **Import**.
2. Choose a local CSV or JSON manifest.
3. Optionally choose a base audio directory if the manifest uses relative paths.
4. Validate the manifest and review the import report.
5. Import valid rows into the local SQLite store.
6. Move to **Annotate** to listen, caption, tag, and review samples.
7. Use **Review** for low-confidence, flagged, or rejected items.
8. Use **Export** to generate a clean training manifest or a richer curation manifest.

## Input manifest expectations

Supported fields:

- `audio_id`
- `audio_path`
- `filename`
- `duration`
- `source_dataset`
- `license`
- `split`
- `tags_raw`
- `candidate_caption`
- `notes`
- `created_at`

CSV is required for the core workflow and JSON is also supported. JSON can be either an array of rows or an object with an `items` array.

## Local data storage

- The app stores its SQLite database in Electron's user data directory.
- The exact database path is visible in the **Settings** screen.
- Imported manifest rows are stored in `audio_items`.
- Human annotations are stored in `annotations`.
- App preferences and taxonomy configuration are stored in `app_settings`.

This keeps the app fully local-first and usable without hosting.

## Notes on persistence and reproducibility

- The database schema is initialized automatically on first launch.
- The taxonomy is seeded from `src/shared/config/defaultTaxonomy.ts`.
- Exports are generated deterministically from the current SQLite state and sorted by `audio_id`.
- Existing audio rows are updated safely on re-import; annotation rows are preserved.

## Review and quality workflow

The app is intentionally designed around dataset quality:

- Candidate captions are always visible but never auto-accepted.
- Structured fields encourage annotation consistency.
- Confidence and review flags support later filtering.
- The review queue helps isolate questionable items before export.

## Example files

- Example manifest CSV: [`examples/sample-manifest.csv`](/C:/Users/ereni/Desktop/code/bitirme-app/examples/sample-manifest.csv)
- Example manifest JSON: [`examples/sample-manifest.json`](/C:/Users/ereni/Desktop/code/bitirme-app/examples/sample-manifest.json)
- Example taxonomy: [`examples/taxonomy.json`](/C:/Users/ereni/Desktop/code/bitirme-app/examples/taxonomy.json)

## Current limitations and extension points

- Waveform visualization is not implemented in v1.
- Multi-annotator consensus is not exposed in the UI yet, but the data model already includes `annotatorId`.
- Annotation history and review decisions can be added later as new SQLite tables.
- In-app caption generation is intentionally deferred.
