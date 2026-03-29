import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import type {
  ImportCommitResult,
  ImportedAudioRecord,
  ImportIssueRow,
  ImportPreviewResult
} from '../../src/shared/types/domain';
import type { CommitImportRequest, PreviewImportRequest } from '../../src/shared/types/ipc';
import { AppDatabase } from '../database/AppDatabase';

const SUPPORTED_EXTENSIONS = new Set([
  '.wav',
  '.mp3',
  '.ogg',
  '.flac',
  '.m4a',
  '.aac',
  '.webm',
  '.aif',
  '.aiff'
]);

const FIELD_ALIASES: Record<string, string[]> = {
  audio_id: ['audio_id', 'id', 'audioId'],
  audio_path: ['audio_path', 'path', 'audioPath', 'filepath', 'file_path'],
  filename: ['filename', 'file_name', 'name'],
  duration: ['duration', 'length', 'seconds'],
  source_dataset: ['source_dataset', 'sourceDataset', 'dataset'],
  license: ['license'],
  split: ['split'],
  tags_raw: ['tags_raw', 'raw_tags', 'tags'],
  candidate_caption: ['candidate_caption', 'candidateCaption', 'caption_candidate'],
  notes: ['notes'],
  created_at: ['created_at', 'createdAt']
};

type ParsedManifest = {
  manifestType: 'csv' | 'json';
  rows: Array<Record<string, unknown>>;
  columns: string[];
};

export class ImportService {
  constructor(private readonly db: AppDatabase) {}

  previewManifest(request: PreviewImportRequest): ImportPreviewResult {
    const parsed = this.parseManifest(request.manifestPath);
    const baseDirectory =
      request.baseDirectory && request.baseDirectory.trim().length > 0
        ? request.baseDirectory
        : path.dirname(request.manifestPath);
    const reportRows: ImportIssueRow[] = [];
    const validItems: ImportedAudioRecord[] = [];
    const seenIds = new Set<string>();
    let warnings = 0;
    let duplicateRows = 0;
    let updatingExistingCount = 0;

    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const normalized = this.normalizeRow(row, baseDirectory);
      const issues: string[] = [];
      let severity: 'error' | 'warning' = 'warning';
      let action: ImportIssueRow['action'] = 'import';

      if (!normalized.id) {
        issues.push('Missing audio identifier. Add `audio_id` or a usable `filename` value.');
        severity = 'error';
        action = 'skip';
      }

      if (!normalized.audioPath) {
        issues.push('Missing audio path. Provide `audio_path` or `filename`.');
        severity = 'error';
        action = 'skip';
      }

      if (normalized.id && seenIds.has(normalized.id)) {
        issues.push('Duplicate audio ID inside the manifest. Later duplicates are skipped.');
        severity = 'error';
        action = 'skip';
        duplicateRows += 1;
      }

      if (normalized.id && !seenIds.has(normalized.id)) {
        seenIds.add(normalized.id);
      }

      if (normalized.audioPath && !fs.existsSync(normalized.audioPath)) {
        issues.push('Referenced audio file does not exist on disk.');
        severity = 'error';
        action = 'skip';
      }

      if (normalized.audioPath) {
        const extension = path.extname(normalized.audioPath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(extension)) {
          issues.push(
            `Audio extension ${extension || '(none)'} is not in the recommended playable list and should be reviewed.`
          );
          warnings += 1;
          normalized.playable = false;
        }
      }

      if (normalized.generatedId) {
        issues.push('Audio ID was generated from the filename because `audio_id` was missing.');
        warnings += 1;
      }

      if (normalized.id && this.db.hasAudioItem(normalized.id)) {
        issues.push('Existing audio item will be updated and its annotation record will be preserved.');
        warnings += 1;
        action = 'update';
        updatingExistingCount += 1;
      }

      if (issues.length > 0) {
        reportRows.push({
          rowNumber,
          audioId: normalized.id,
          filename: normalized.filename,
          resolvedAudioPath: normalized.audioPath,
          severity,
          issues,
          action
        });
      }

      if (severity !== 'error' && normalized.id && normalized.audioPath && normalized.filename) {
        validItems.push({
          id: normalized.id,
          audioPath: normalized.audioPath,
          filename: normalized.filename,
          duration: normalized.duration,
          sourceDataset: normalized.sourceDataset,
          license: normalized.license,
          split: normalized.split,
          rawTags: normalized.rawTags,
          candidateCaption: normalized.candidateCaption,
          notes: normalized.notes,
          manifestCreatedAt: normalized.manifestCreatedAt,
          playable: normalized.playable
        });
      }
    });

    return {
      manifestPath: request.manifestPath,
      manifestType: parsed.manifestType,
      totalRows: parsed.rows.length,
      validRows: validItems.length,
      invalidRows: parsed.rows.length - validItems.length,
      warnings,
      updatingExistingCount,
      duplicateRows,
      columns: parsed.columns,
      detectedBaseDirectory: baseDirectory,
      reportRows
    };
  }

  commitImport(request: CommitImportRequest): ImportCommitResult {
    const preview = this.previewManifest(request);
    const parsed = this.parseManifest(request.manifestPath);
    const baseDirectory =
      request.baseDirectory && request.baseDirectory.trim().length > 0
        ? request.baseDirectory
        : path.dirname(request.manifestPath);
    const validItems: ImportedAudioRecord[] = [];
    const seenIds = new Set<string>();

    for (const row of parsed.rows) {
      const normalized = this.normalizeRow(row, baseDirectory);
      if (!normalized.id || !normalized.audioPath || !normalized.filename || seenIds.has(normalized.id)) {
        continue;
      }

      seenIds.add(normalized.id);
      if (!fs.existsSync(normalized.audioPath)) {
        continue;
      }

      validItems.push({
        id: normalized.id,
        audioPath: normalized.audioPath,
        filename: normalized.filename,
        duration: normalized.duration,
        sourceDataset: normalized.sourceDataset,
        license: normalized.license,
        split: normalized.split,
        rawTags: normalized.rawTags,
        candidateCaption: normalized.candidateCaption,
        notes: normalized.notes,
        manifestCreatedAt: normalized.manifestCreatedAt,
        playable: normalized.playable
      });
    }

    const result = this.db.upsertAudioItems(validItems);
    return {
      importedCount: result.importedCount,
      skippedCount: preview.invalidRows,
      updatedCount: result.updatedCount,
      preview
    };
  }

  private parseManifest(manifestPath: string): ParsedManifest {
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    const extension = path.extname(manifestPath).toLowerCase();
    const content = fs.readFileSync(manifestPath, 'utf-8');

    if (extension === '.csv') {
      const parsed = Papa.parse<Record<string, unknown>>(content, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim()
      });

      if (parsed.errors.length > 0) {
        throw new Error(`CSV parsing failed: ${parsed.errors[0]?.message ?? 'Unknown error'}`);
      }

      return {
        manifestType: 'csv',
        rows: parsed.data,
        columns: parsed.meta.fields ?? []
      };
    }

    if (extension === '.json') {
      const parsed = JSON.parse(content) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : typeof parsed === 'object' && parsed && Array.isArray((parsed as { items?: unknown[] }).items)
          ? (parsed as { items: unknown[] }).items
          : null;

      if (!rows) {
        throw new Error('JSON manifest must be an array of objects or an object with an `items` array.');
      }

      const normalizedRows = rows.filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
      );
      const columns = new Set<string>();
      normalizedRows.forEach((row) => {
        Object.keys(row).forEach((key) => columns.add(key));
      });

      return {
        manifestType: 'json',
        rows: normalizedRows,
        columns: Array.from(columns)
      };
    }

    throw new Error('Unsupported manifest type. Use CSV or JSON.');
  }

  private normalizeRow(row: Record<string, unknown>, baseDirectory: string) {
    const audioPathRaw = getFieldValue(row, FIELD_ALIASES.audio_path);
    const filenameRaw = getFieldValue(row, FIELD_ALIASES.filename);
    const candidatePath = sanitizeString(audioPathRaw) ?? sanitizeString(filenameRaw);
    const resolvedAudioPath = candidatePath
      ? path.isAbsolute(candidatePath)
        ? candidatePath
        : path.resolve(baseDirectory, candidatePath)
      : null;
    const filename = sanitizeString(filenameRaw) ?? (resolvedAudioPath ? path.basename(resolvedAudioPath) : null);
    const explicitId = sanitizeString(getFieldValue(row, FIELD_ALIASES.audio_id));
    const generatedId = !explicitId && filename ? slugify(path.parse(filename).name) : null;
    const id = explicitId ?? generatedId;

    return {
      id,
      generatedId: Boolean(generatedId),
      audioPath: resolvedAudioPath,
      filename,
      duration: parseNullableNumber(getFieldValue(row, FIELD_ALIASES.duration)),
      sourceDataset: sanitizeString(getFieldValue(row, FIELD_ALIASES.source_dataset)),
      license: sanitizeString(getFieldValue(row, FIELD_ALIASES.license)),
      split: sanitizeString(getFieldValue(row, FIELD_ALIASES.split)),
      rawTags: parseRawTags(getFieldValue(row, FIELD_ALIASES.tags_raw)),
      candidateCaption: sanitizeString(getFieldValue(row, FIELD_ALIASES.candidate_caption)),
      notes: sanitizeString(getFieldValue(row, FIELD_ALIASES.notes)),
      manifestCreatedAt: sanitizeString(getFieldValue(row, FIELD_ALIASES.created_at)),
      playable: resolvedAudioPath
        ? SUPPORTED_EXTENSIONS.has(path.extname(resolvedAudioPath).toLowerCase())
        : false
    };
  }
}

function getFieldValue(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (alias in row) {
      return row[alias];
    }
  }

  return null;
}

function sanitizeString(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseRawTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => sanitizeString(entry))
          .filter((entry): entry is string => Boolean(entry))
      )
    );
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parseRawTags(parsed);
    }
  } catch {
    return Array.from(
      new Set(
        trimmed
          .split(/[|,;]/g)
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function slugify(value: string): string | null {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : null;
}
