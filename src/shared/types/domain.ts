export type AnnotationStatus =
  | 'unannotated'
  | 'in_progress'
  | 'annotated'
  | 'needs_review'
  | 'rejected';

export type CaptionActionType = 'approved' | 'edited' | 'rewritten' | 'unusable';

export type CandidateCaptionFilter = 'all' | 'present' | 'missing';

export type ExportKind = 'pairs' | 'rich' | 'summary';

export type ExportFormat = 'csv' | 'json';

export interface AudioItem {
  id: string;
  audioPath: string;
  filename: string;
  duration: number | null;
  sourceDataset: string | null;
  license: string | null;
  split: string | null;
  rawTags: string[];
  candidateCaption: string | null;
  notes: string | null;
  manifestCreatedAt: string | null;
  playable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Annotation {
  id: string;
  audioItemId: string;
  annotatorId: string;
  captionFinal: string;
  captionLong: string;
  captionActionType: CaptionActionType;
  soundType: string | null;
  moods: string[];
  timbres: string[];
  motion: string | null;
  useCases: string[];
  confidence: number | null;
  llmCaptionIncorrect: boolean;
  audioUnclear: boolean;
  licenseConcern: boolean;
  reviewNotes: string;
  status: AnnotationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SampleDetail {
  audioItem: AudioItem;
  annotation: Annotation;
}

export interface SampleListItem {
  id: string;
  filename: string;
  audioPath: string;
  sourceDataset: string | null;
  candidateCaption: string | null;
  rawTags: string[];
  playable: boolean;
  status: AnnotationStatus;
  confidence: number | null;
  captionFinal: string;
  llmCaptionIncorrect: boolean;
  audioUnclear: boolean;
  licenseConcern: boolean;
  updatedAt: string | null;
}

export interface DatasetStats {
  totalSamples: number;
  annotatedCount: number;
  inProgressCount: number;
  remainingCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  progressPercent: number;
}

export interface TaxonomyConfig {
  soundTypes: string[];
  moods: string[];
  timbres: string[];
  motions: string[];
  useCases: string[];
}

export interface AppSettings {
  audioBaseDirectory: string | null;
  exportDirectory: string | null;
  autosaveEnabled: boolean;
  activeAnnotatorId: string;
  theme: 'light';
}

export interface SampleFilters {
  search: string;
  statuses: AnnotationStatus[];
  candidateCaption: CandidateCaptionFilter;
  sourceDataset: string | 'all';
  confidenceMin: number | null;
  confidenceMax: number | null;
  tagQuery: string;
  reviewOnly: boolean;
  flaggedOnly: boolean;
}

export interface ImportedAudioRecord {
  id: string;
  audioPath: string;
  filename: string;
  duration: number | null;
  sourceDataset: string | null;
  license: string | null;
  split: string | null;
  rawTags: string[];
  candidateCaption: string | null;
  notes: string | null;
  manifestCreatedAt: string | null;
  playable: boolean;
}

export interface ImportIssueRow {
  rowNumber: number;
  audioId: string | null;
  filename: string | null;
  resolvedAudioPath: string | null;
  severity: 'error' | 'warning';
  issues: string[];
  action: 'skip' | 'import' | 'update';
}

export interface ImportPreviewResult {
  manifestPath: string;
  manifestType: 'csv' | 'json';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings: number;
  updatingExistingCount: number;
  duplicateRows: number;
  columns: string[];
  detectedBaseDirectory: string;
  reportRows: ImportIssueRow[];
}

export interface ImportCommitResult {
  importedCount: number;
  skippedCount: number;
  updatedCount: number;
  preview: ImportPreviewResult;
}

export interface SaveAnnotationInput {
  audioItemId: string;
  annotatorId: string;
  captionFinal: string;
  captionLong: string;
  captionActionType: CaptionActionType;
  soundType: string | null;
  moods: string[];
  timbres: string[];
  motion: string | null;
  useCases: string[];
  confidence: number | null;
  llmCaptionIncorrect: boolean;
  audioUnclear: boolean;
  licenseConcern: boolean;
  reviewNotes: string;
  status: AnnotationStatus;
}

export interface SaveAnnotationResponse {
  detail: SampleDetail;
  stats: DatasetStats;
}

export interface ExportOptions {
  statuses: AnnotationStatus[];
  minConfidence: number | null;
  excludeFlagged: boolean;
  requireCaption: boolean;
  annotatorId: string;
}

export interface BootstrapPayload {
  settings: AppSettings;
  taxonomy: TaxonomyConfig;
  stats: DatasetStats;
  sources: string[];
  storagePath: string;
  userDataPath: string;
}
