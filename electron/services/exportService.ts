import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { BrowserWindow, dialog } from 'electron';
import type { ExportRequest, ExportResult } from '../../src/shared/types/ipc';
import { AppDatabase } from '../database/AppDatabase';

export class ExportService {
  constructor(private readonly db: AppDatabase) {}

  async exportDataset(mainWindow: BrowserWindow, request: ExportRequest): Promise<ExportResult | null> {
    const settings = this.db.getSettings();
    const suggestedName = this.buildSuggestedFilename(request.kind, request.format);
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Export dataset manifest',
      defaultPath: path.join(settings.exportDirectory ?? process.cwd(), suggestedName),
      filters:
        request.format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'JSON', extensions: ['json'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    if (request.kind === 'pairs') {
      const payload = this.db.getSamplesForExport(request.options).map((detail) => ({
        audio_id: detail.audioItem.id,
        audio_path: detail.audioItem.audioPath,
        caption_final: detail.annotation.captionFinal
      }));
      this.writeOutput(saveResult.filePath, request.format, payload);
      this.db.saveSettings({ exportDirectory: path.dirname(saveResult.filePath) });
      return {
        kind: request.kind,
        format: request.format,
        rowCount: payload.length,
        targetPath: saveResult.filePath
      };
    }

    if (request.kind === 'rich') {
      const payload = this.db.getSamplesForExport(request.options).map((detail) => ({
        audio_id: detail.audioItem.id,
        audio_path: detail.audioItem.audioPath,
        filename: detail.audioItem.filename,
        duration: detail.audioItem.duration,
        source_dataset: detail.audioItem.sourceDataset,
        license: detail.audioItem.license,
        split: detail.audioItem.split,
        tags_raw: detail.audioItem.rawTags.join('|'),
        candidate_caption: detail.audioItem.candidateCaption,
        notes: detail.audioItem.notes,
        caption_final: detail.annotation.captionFinal,
        caption_long: detail.annotation.captionLong,
        caption_action_type: detail.annotation.captionActionType,
        sound_type: detail.annotation.soundType,
        moods: detail.annotation.moods.join('|'),
        timbres: detail.annotation.timbres.join('|'),
        motion: detail.annotation.motion,
        use_cases: detail.annotation.useCases.join('|'),
        confidence: detail.annotation.confidence,
        llm_caption_incorrect: detail.annotation.llmCaptionIncorrect,
        audio_unclear: detail.annotation.audioUnclear,
        license_concern: detail.annotation.licenseConcern,
        review_notes: detail.annotation.reviewNotes,
        status: detail.annotation.status,
        annotator_id: detail.annotation.annotatorId,
        created_at: detail.annotation.createdAt,
        updated_at: detail.annotation.updatedAt
      }));
      this.writeOutput(saveResult.filePath, request.format, payload);
      this.db.saveSettings({ exportDirectory: path.dirname(saveResult.filePath) });
      return {
        kind: request.kind,
        format: request.format,
        rowCount: payload.length,
        targetPath: saveResult.filePath
      };
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      filters: request.options,
      stats: this.db.getStats(request.options.annotatorId)
    };
    this.writeOutput(saveResult.filePath, 'json', payload);
    this.db.saveSettings({ exportDirectory: path.dirname(saveResult.filePath) });
    return {
      kind: request.kind,
      format: 'json',
      rowCount: 1,
      targetPath: saveResult.filePath
    };
  }

  private writeOutput(filePath: string, format: 'csv' | 'json', payload: unknown): void {
    if (format === 'json') {
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return;
    }

    if (!Array.isArray(payload)) {
      throw new Error('CSV exports require an array payload.');
    }

    fs.writeFileSync(filePath, Papa.unparse(payload), 'utf-8');
  }

  private buildSuggestedFilename(kind: ExportRequest['kind'], format: ExportRequest['format']): string {
    const stamp = new Date().toISOString().slice(0, 10);
    return `semantic-audio-${kind}-${stamp}.${format}`;
  }
}
