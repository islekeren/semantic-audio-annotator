import type {
  AppSettings,
  BootstrapPayload,
  ExportFormat,
  ExportKind,
  ExportOptions,
  ImportCommitResult,
  ImportPreviewResult,
  SampleDetail,
  SampleFilters,
  SampleListItem,
  SaveAnnotationInput,
  SaveAnnotationResponse,
  TaxonomyConfig
} from './domain';

export interface PreviewImportRequest {
  manifestPath: string;
  baseDirectory?: string | null;
}

export interface CommitImportRequest {
  manifestPath: string;
  baseDirectory?: string | null;
}

export interface ExportRequest {
  kind: ExportKind;
  format: ExportFormat;
  options: ExportOptions;
}

export interface ExportResult {
  kind: ExportKind;
  format: ExportFormat;
  rowCount: number;
  targetPath: string;
}

export interface DesktopApi {
  getBootstrap(): Promise<BootstrapPayload>;
  listSamples(filters: SampleFilters): Promise<SampleListItem[]>;
  getSample(id: string): Promise<SampleDetail | null>;
  saveAnnotation(input: SaveAnnotationInput): Promise<SaveAnnotationResponse>;
  saveSettings(input: Partial<AppSettings>): Promise<AppSettings>;
  saveTaxonomy(taxonomy: TaxonomyConfig): Promise<TaxonomyConfig>;
  openManifestFile(): Promise<string | null>;
  openDirectory(defaultPath?: string | null): Promise<string | null>;
  previewImport(request: PreviewImportRequest): Promise<ImportPreviewResult>;
  commitImport(request: CommitImportRequest): Promise<ImportCommitResult>;
  exportDataset(request: ExportRequest): Promise<ExportResult | null>;
  toFileUrl(filePath: string): Promise<string>;
}
