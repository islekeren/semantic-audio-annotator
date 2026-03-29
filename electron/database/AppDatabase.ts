import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import defaultTaxonomy from '../../src/shared/config/defaultTaxonomy';
import type {
  Annotation,
  AnnotationStatus,
  AppSettings,
  AudioItem,
  DatasetStats,
  ExportOptions,
  ImportedAudioRecord,
  SampleDetail,
  SampleFilters,
  SampleListItem,
  SaveAnnotationInput,
  TaxonomyConfig
} from '../../src/shared/types/domain';
import { runMigrations } from './migrations';

type JoinedRow = {
  id: string;
  audio_path: string;
  filename: string;
  duration: number | null;
  source_dataset: string | null;
  license: string | null;
  split: string | null;
  raw_tags_json: string;
  candidate_caption: string | null;
  notes: string | null;
  manifest_created_at: string | null;
  playable: number;
  audio_created_at: string;
  audio_updated_at: string;
  annotation_id: string | null;
  annotator_id: string | null;
  caption_final: string | null;
  caption_long: string | null;
  caption_action_type: string | null;
  sound_type: string | null;
  moods_json: string | null;
  timbres_json: string | null;
  motion: string | null;
  use_cases_json: string | null;
  confidence: number | null;
  llm_caption_incorrect: number | null;
  audio_unclear: number | null;
  license_concern: number | null;
  review_notes: string | null;
  status: string | null;
  annotation_created_at: string | null;
  annotation_updated_at: string | null;
};

const DEFAULT_SETTINGS: AppSettings = {
  audioBaseDirectory: null,
  exportDirectory: null,
  autosaveEnabled: true,
  activeAnnotatorId: 'local-user',
  theme: 'light'
};

export class AppDatabase {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    runMigrations(this.db);
    this.seedDefaults();
  }

  get path(): string {
    return this.dbPath;
  }

  getSettings(): AppSettings {
    return {
      ...DEFAULT_SETTINGS,
      ...this.getSetting<Partial<AppSettings>>('settings', {})
    };
  }

  saveSettings(input: Partial<AppSettings>): AppSettings {
    const merged = {
      ...this.getSettings(),
      ...input
    };
    this.setSetting('settings', merged);
    return merged;
  }

  getTaxonomy(): TaxonomyConfig {
    return this.getSetting<TaxonomyConfig>('taxonomy', defaultTaxonomy);
  }

  saveTaxonomy(taxonomy: TaxonomyConfig): TaxonomyConfig {
    this.setSetting('taxonomy', taxonomy);
    return taxonomy;
  }

  hasAudioItem(id: string): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM audio_items WHERE id = ?').get(id) as
      | { count: number }
      | undefined;
    return Boolean(row?.count);
  }

  upsertAudioItems(items: ImportedAudioRecord[]): { importedCount: number; updatedCount: number } {
    if (items.length === 0) {
      return { importedCount: 0, updatedCount: 0 };
    }

    const placeholders = items.map(() => '?').join(', ');
    const existingRows = this.db
      .prepare(`SELECT id FROM audio_items WHERE id IN (${placeholders})`)
      .all(...items.map((item) => item.id)) as Array<{ id: string }>;
    const updatedCount = existingRows.length;
    const now = new Date().toISOString();

    const statement = this.db.prepare(`
      INSERT INTO audio_items (
        id,
        audio_path,
        filename,
        duration,
        source_dataset,
        license,
        split,
        raw_tags_json,
        candidate_caption,
        notes,
        manifest_created_at,
        playable,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @audio_path,
        @filename,
        @duration,
        @source_dataset,
        @license,
        @split,
        @raw_tags_json,
        @candidate_caption,
        @notes,
        @manifest_created_at,
        @playable,
        @created_at,
        @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        audio_path = excluded.audio_path,
        filename = excluded.filename,
        duration = excluded.duration,
        source_dataset = excluded.source_dataset,
        license = excluded.license,
        split = excluded.split,
        raw_tags_json = excluded.raw_tags_json,
        candidate_caption = excluded.candidate_caption,
        notes = excluded.notes,
        manifest_created_at = excluded.manifest_created_at,
        playable = excluded.playable,
        updated_at = excluded.updated_at
    `);

    this.db.exec('BEGIN');
    try {
      for (const item of items) {
        statement.run({
          id: item.id,
          audio_path: item.audioPath,
          filename: item.filename,
          duration: item.duration,
          source_dataset: item.sourceDataset,
          license: item.license,
          split: item.split,
          raw_tags_json: JSON.stringify(item.rawTags),
          candidate_caption: item.candidateCaption,
          notes: item.notes,
          manifest_created_at: item.manifestCreatedAt,
          playable: item.playable ? 1 : 0,
          created_at: now,
          updated_at: now
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { importedCount: items.length, updatedCount };
  }

  listSamples(filters: SampleFilters, annotatorId = this.getSettings().activeAnnotatorId): SampleListItem[] {
    const { whereSql, params } = this.buildFilterClause(filters, annotatorId);
    const rows = this.db
      .prepare(`
        SELECT
          ai.id,
          ai.audio_path,
          ai.filename,
          ai.duration,
          ai.source_dataset,
          ai.license,
          ai.split,
          ai.raw_tags_json,
          ai.candidate_caption,
          ai.notes,
          ai.manifest_created_at,
          ai.playable,
          ai.created_at AS audio_created_at,
          ai.updated_at AS audio_updated_at,
          a.id AS annotation_id,
          a.annotator_id,
          a.caption_final,
          a.caption_long,
          a.caption_action_type,
          a.sound_type,
          a.moods_json,
          a.timbres_json,
          a.motion,
          a.use_cases_json,
          a.confidence,
          a.llm_caption_incorrect,
          a.audio_unclear,
          a.license_concern,
          a.review_notes,
          a.status,
          a.created_at AS annotation_created_at,
          a.updated_at AS annotation_updated_at
        FROM audio_items ai
        LEFT JOIN annotations a
          ON a.audio_item_id = ai.id
          AND a.annotator_id = ?
        ${whereSql}
        ORDER BY
          CASE COALESCE(a.status, 'unannotated')
            WHEN 'needs_review' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'unannotated' THEN 2
            WHEN 'annotated' THEN 3
            WHEN 'rejected' THEN 4
            ELSE 5
          END,
          LOWER(ai.filename),
          ai.id
      `)
      .all(...params) as JoinedRow[];

    return rows.map((row) => {
      const detail = this.mapJoinedRow(row, annotatorId);
      return {
        id: detail.audioItem.id,
        filename: detail.audioItem.filename,
        audioPath: detail.audioItem.audioPath,
        sourceDataset: detail.audioItem.sourceDataset,
        candidateCaption: detail.audioItem.candidateCaption,
        rawTags: detail.audioItem.rawTags,
        playable: detail.audioItem.playable,
        status: detail.annotation.status,
        confidence: detail.annotation.confidence,
        captionFinal: detail.annotation.captionFinal,
        llmCaptionIncorrect: detail.annotation.llmCaptionIncorrect,
        audioUnclear: detail.annotation.audioUnclear,
        licenseConcern: detail.annotation.licenseConcern,
        updatedAt: row.annotation_updated_at
      };
    });
  }

  getSampleById(id: string, annotatorId = this.getSettings().activeAnnotatorId): SampleDetail | null {
    const row = this.db
      .prepare(`
        SELECT
          ai.id,
          ai.audio_path,
          ai.filename,
          ai.duration,
          ai.source_dataset,
          ai.license,
          ai.split,
          ai.raw_tags_json,
          ai.candidate_caption,
          ai.notes,
          ai.manifest_created_at,
          ai.playable,
          ai.created_at AS audio_created_at,
          ai.updated_at AS audio_updated_at,
          a.id AS annotation_id,
          a.annotator_id,
          a.caption_final,
          a.caption_long,
          a.caption_action_type,
          a.sound_type,
          a.moods_json,
          a.timbres_json,
          a.motion,
          a.use_cases_json,
          a.confidence,
          a.llm_caption_incorrect,
          a.audio_unclear,
          a.license_concern,
          a.review_notes,
          a.status,
          a.created_at AS annotation_created_at,
          a.updated_at AS annotation_updated_at
        FROM audio_items ai
        LEFT JOIN annotations a
          ON a.audio_item_id = ai.id
          AND a.annotator_id = ?
        WHERE ai.id = ?
      `)
      .get(annotatorId, id) as JoinedRow | undefined;

    return row ? this.mapJoinedRow(row, annotatorId) : null;
  }

  saveAnnotation(input: SaveAnnotationInput): SampleDetail {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id, created_at FROM annotations WHERE audio_item_id = ? AND annotator_id = ?')
      .get(input.audioItemId, input.annotatorId) as { id: string; created_at: string } | undefined;

    const annotationId = existing?.id ?? randomUUID();
    const createdAt = existing?.created_at ?? now;
    const status = input.captionActionType === 'unusable' ? 'rejected' : this.normalizeStatus(input.status);

    this.db
      .prepare(`
        INSERT INTO annotations (
          id,
          audio_item_id,
          annotator_id,
          caption_final,
          caption_long,
          caption_action_type,
          sound_type,
          moods_json,
          timbres_json,
          motion,
          use_cases_json,
          confidence,
          llm_caption_incorrect,
          audio_unclear,
          license_concern,
          review_notes,
          status,
          created_at,
          updated_at
        ) VALUES (
          @id,
          @audio_item_id,
          @annotator_id,
          @caption_final,
          @caption_long,
          @caption_action_type,
          @sound_type,
          @moods_json,
          @timbres_json,
          @motion,
          @use_cases_json,
          @confidence,
          @llm_caption_incorrect,
          @audio_unclear,
          @license_concern,
          @review_notes,
          @status,
          @created_at,
          @updated_at
        )
        ON CONFLICT(audio_item_id, annotator_id) DO UPDATE SET
          caption_final = excluded.caption_final,
          caption_long = excluded.caption_long,
          caption_action_type = excluded.caption_action_type,
          sound_type = excluded.sound_type,
          moods_json = excluded.moods_json,
          timbres_json = excluded.timbres_json,
          motion = excluded.motion,
          use_cases_json = excluded.use_cases_json,
          confidence = excluded.confidence,
          llm_caption_incorrect = excluded.llm_caption_incorrect,
          audio_unclear = excluded.audio_unclear,
          license_concern = excluded.license_concern,
          review_notes = excluded.review_notes,
          status = excluded.status,
          updated_at = excluded.updated_at
      `)
      .run({
        id: annotationId,
        audio_item_id: input.audioItemId,
        annotator_id: input.annotatorId,
        caption_final: input.captionFinal.trim(),
        caption_long: input.captionLong.trim(),
        caption_action_type: input.captionActionType,
        sound_type: nullableString(input.soundType),
        moods_json: JSON.stringify(uniqueStrings(input.moods)),
        timbres_json: JSON.stringify(uniqueStrings(input.timbres)),
        motion: nullableString(input.motion),
        use_cases_json: JSON.stringify(uniqueStrings(input.useCases)),
        confidence: input.confidence,
        llm_caption_incorrect: input.llmCaptionIncorrect ? 1 : 0,
        audio_unclear: input.audioUnclear ? 1 : 0,
        license_concern: input.licenseConcern ? 1 : 0,
        review_notes: input.reviewNotes.trim(),
        status,
        created_at: createdAt,
        updated_at: now
      });

    const detail = this.getSampleById(input.audioItemId, input.annotatorId);
    if (!detail) {
      throw new Error('Saved annotation could not be reloaded.');
    }

    return detail;
  }

  getStats(annotatorId = this.getSettings().activeAnnotatorId): DatasetStats {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) AS totalSamples,
          SUM(CASE WHEN COALESCE(a.status, 'unannotated') = 'annotated' THEN 1 ELSE 0 END) AS annotatedCount,
          SUM(CASE WHEN COALESCE(a.status, 'unannotated') = 'in_progress' THEN 1 ELSE 0 END) AS inProgressCount,
          SUM(CASE WHEN COALESCE(a.status, 'unannotated') = 'unannotated' THEN 1 ELSE 0 END) AS remainingCount,
          SUM(CASE WHEN COALESCE(a.status, 'unannotated') = 'needs_review' THEN 1 ELSE 0 END) AS needsReviewCount,
          SUM(CASE WHEN COALESCE(a.status, 'unannotated') = 'rejected' THEN 1 ELSE 0 END) AS rejectedCount
        FROM audio_items ai
        LEFT JOIN annotations a
          ON a.audio_item_id = ai.id
          AND a.annotator_id = ?
      `)
      .get(annotatorId) as Record<string, number | null | undefined>;

    const totalSamples = Number(row.totalSamples ?? 0);
    const doneCount =
      Number(row.annotatedCount ?? 0) +
      Number(row.needsReviewCount ?? 0) +
      Number(row.rejectedCount ?? 0);

    return {
      totalSamples,
      annotatedCount: Number(row.annotatedCount ?? 0),
      inProgressCount: Number(row.inProgressCount ?? 0),
      remainingCount: Number(row.remainingCount ?? 0),
      needsReviewCount: Number(row.needsReviewCount ?? 0),
      rejectedCount: Number(row.rejectedCount ?? 0),
      progressPercent: totalSamples === 0 ? 0 : Math.round((doneCount / totalSamples) * 100)
    };
  }

  getDistinctSources(): string[] {
    const rows = this.db
      .prepare(`
        SELECT DISTINCT source_dataset
        FROM audio_items
        WHERE source_dataset IS NOT NULL AND TRIM(source_dataset) != ''
        ORDER BY LOWER(source_dataset)
      `)
      .all() as Array<{ source_dataset: string | null }>;

    return rows.map((row) => row.source_dataset).filter((value): value is string => Boolean(value));
  }

  getSamplesForExport(options: ExportOptions): SampleDetail[] {
    const filters: SampleFilters = {
      search: '',
      statuses: options.statuses,
      candidateCaption: 'all',
      sourceDataset: 'all',
      confidenceMin: options.minConfidence,
      confidenceMax: null,
      tagQuery: '',
      reviewOnly: false,
      flaggedOnly: false
    };

    return this.listSamples(filters, options.annotatorId)
      .map((item) => this.getSampleById(item.id, options.annotatorId))
      .filter((detail): detail is SampleDetail => Boolean(detail))
      .filter((detail) => {
        if (options.excludeFlagged) {
          const hasFlag =
            detail.annotation.llmCaptionIncorrect ||
            detail.annotation.audioUnclear ||
            detail.annotation.licenseConcern;
          if (hasFlag) {
            return false;
          }
        }

        if (options.requireCaption && detail.annotation.captionFinal.trim().length === 0) {
          return false;
        }

        return true;
      })
      .sort((left, right) => left.audioItem.id.localeCompare(right.audioItem.id));
  }

  private seedDefaults(): void {
    if (!this.getSetting('settings', null)) {
      this.setSetting('settings', DEFAULT_SETTINGS);
    }

    if (!this.getSetting('taxonomy', null)) {
      this.setSetting('taxonomy', defaultTaxonomy);
    }
  }

  private getSetting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as
      | { value_json: string }
      | undefined;

    if (!row) {
      return fallback;
    }

    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  private setSetting<T>(key: string, value: T): void {
    this.db
      .prepare(`
        INSERT INTO app_settings (key, value_json)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
      `)
      .run(key, JSON.stringify(value));
  }

  private buildFilterClause(
    filters: SampleFilters,
    annotatorId: string
  ): { whereSql: string; params: Array<string | number> } {
    const where: string[] = [];
    const params: Array<string | number> = [annotatorId];

    if (filters.search.trim()) {
      where.push('(LOWER(ai.id) LIKE ? OR LOWER(ai.filename) LIKE ?)');
      const pattern = `%${filters.search.trim().toLowerCase()}%`;
      params.push(pattern, pattern);
    }

    if (filters.statuses.length > 0) {
      where.push(`COALESCE(a.status, 'unannotated') IN (${filters.statuses.map(() => '?').join(', ')})`);
      params.push(...filters.statuses);
    }

    if (filters.candidateCaption === 'present') {
      where.push("TRIM(COALESCE(ai.candidate_caption, '')) != ''");
    }

    if (filters.candidateCaption === 'missing') {
      where.push("TRIM(COALESCE(ai.candidate_caption, '')) = ''");
    }

    if (filters.sourceDataset !== 'all') {
      where.push("COALESCE(ai.source_dataset, '') = ?");
      params.push(filters.sourceDataset);
    }

    if (filters.confidenceMin !== null) {
      where.push('a.confidence IS NOT NULL AND a.confidence >= ?');
      params.push(filters.confidenceMin);
    }

    if (filters.confidenceMax !== null) {
      where.push('a.confidence IS NOT NULL AND a.confidence <= ?');
      params.push(filters.confidenceMax);
    }

    if (filters.tagQuery.trim()) {
      where.push('LOWER(ai.raw_tags_json) LIKE ?');
      params.push(`%${filters.tagQuery.trim().toLowerCase()}%`);
    }

    if (filters.flaggedOnly) {
      where.push(
        '(COALESCE(a.llm_caption_incorrect, 0) = 1 OR COALESCE(a.audio_unclear, 0) = 1 OR COALESCE(a.license_concern, 0) = 1)'
      );
    }

    if (filters.reviewOnly) {
      where.push(`(
        COALESCE(a.status, 'unannotated') = 'needs_review'
        OR COALESCE(a.status, 'unannotated') = 'rejected'
        OR COALESCE(a.confidence, 5) <= 2
        OR COALESCE(a.llm_caption_incorrect, 0) = 1
        OR COALESCE(a.audio_unclear, 0) = 1
        OR COALESCE(a.license_concern, 0) = 1
      )`);
    }

    return {
      whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
      params
    };
  }

  private mapJoinedRow(row: JoinedRow, annotatorId: string): SampleDetail {
    const audioItem: AudioItem = {
      id: row.id,
      audioPath: row.audio_path,
      filename: row.filename,
      duration: row.duration,
      sourceDataset: nullableString(row.source_dataset),
      license: nullableString(row.license),
      split: nullableString(row.split),
      rawTags: parseStringArray(row.raw_tags_json),
      candidateCaption: nullableString(row.candidate_caption),
      notes: nullableString(row.notes),
      manifestCreatedAt: nullableString(row.manifest_created_at),
      playable: row.playable === 1,
      createdAt: row.audio_created_at,
      updatedAt: row.audio_updated_at
    };

    const annotation = row.annotation_id
      ? ({
          id: row.annotation_id,
          audioItemId: row.id,
          annotatorId: row.annotator_id ?? annotatorId,
          captionFinal: row.caption_final ?? '',
          captionLong: row.caption_long ?? '',
          captionActionType: (row.caption_action_type ?? 'edited') as Annotation['captionActionType'],
          soundType: nullableString(row.sound_type),
          moods: parseStringArray(row.moods_json),
          timbres: parseStringArray(row.timbres_json),
          motion: nullableString(row.motion),
          useCases: parseStringArray(row.use_cases_json),
          confidence: row.confidence,
          llmCaptionIncorrect: row.llm_caption_incorrect === 1,
          audioUnclear: row.audio_unclear === 1,
          licenseConcern: row.license_concern === 1,
          reviewNotes: row.review_notes ?? '',
          status: this.normalizeStatus(row.status as AnnotationStatus | null),
          createdAt: row.annotation_created_at ?? row.audio_created_at,
          updatedAt: row.annotation_updated_at ?? row.audio_updated_at
        } satisfies Annotation)
      : this.makeDefaultAnnotation(audioItem, annotatorId);

    return {
      audioItem,
      annotation
    };
  }

  private makeDefaultAnnotation(audioItem: AudioItem, annotatorId: string): Annotation {
    const now = audioItem.updatedAt;
    return {
      id: `draft:${audioItem.id}:${annotatorId}`,
      audioItemId: audioItem.id,
      annotatorId,
      captionFinal: '',
      captionLong: '',
      captionActionType: audioItem.candidateCaption ? 'edited' : 'rewritten',
      soundType: null,
      moods: [],
      timbres: [],
      motion: null,
      useCases: [],
      confidence: null,
      llmCaptionIncorrect: false,
      audioUnclear: false,
      licenseConcern: false,
      reviewNotes: '',
      status: 'unannotated',
      createdAt: now,
      updatedAt: now
    };
  }

  private normalizeStatus(status: AnnotationStatus | null): AnnotationStatus {
    if (
      status === 'unannotated' ||
      status === 'in_progress' ||
      status === 'annotated' ||
      status === 'needs_review' ||
      status === 'rejected'
    ) {
      return status;
    }

    return 'unannotated';
  }
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return uniqueStrings(parsed.map((entry) => String(entry)));
    }
  } catch {
    return [];
  }

  return [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

function nullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
