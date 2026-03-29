import type { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync): void {
  const versionRow = db.prepare('PRAGMA user_version').get() as { user_version?: number };
  const version = Number(versionRow.user_version ?? 0);

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audio_items (
        id TEXT PRIMARY KEY,
        audio_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        duration REAL,
        source_dataset TEXT,
        license TEXT,
        split TEXT,
        raw_tags_json TEXT NOT NULL DEFAULT '[]',
        candidate_caption TEXT,
        notes TEXT,
        manifest_created_at TEXT,
        playable INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        audio_item_id TEXT NOT NULL,
        annotator_id TEXT NOT NULL,
        caption_final TEXT NOT NULL DEFAULT '',
        caption_long TEXT NOT NULL DEFAULT '',
        caption_action_type TEXT NOT NULL DEFAULT 'edited',
        sound_type TEXT,
        moods_json TEXT NOT NULL DEFAULT '[]',
        timbres_json TEXT NOT NULL DEFAULT '[]',
        motion TEXT,
        use_cases_json TEXT NOT NULL DEFAULT '[]',
        confidence INTEGER,
        llm_caption_incorrect INTEGER NOT NULL DEFAULT 0,
        audio_unclear INTEGER NOT NULL DEFAULT 0,
        license_concern INTEGER NOT NULL DEFAULT 0,
        review_notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'unannotated',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(audio_item_id) REFERENCES audio_items(id) ON DELETE CASCADE,
        UNIQUE(audio_item_id, annotator_id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audio_items_filename ON audio_items(filename);
      CREATE INDEX IF NOT EXISTS idx_audio_items_source_dataset ON audio_items(source_dataset);
      CREATE INDEX IF NOT EXISTS idx_annotations_audio_item ON annotations(audio_item_id);
      CREATE INDEX IF NOT EXISTS idx_annotations_status ON annotations(status);
      CREATE INDEX IF NOT EXISTS idx_annotations_confidence ON annotations(confidence);
    `);

    db.exec('PRAGMA user_version = 1;');
  }
}
