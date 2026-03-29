import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  SampleFilters,
  SaveAnnotationInput,
  TaxonomyConfig
} from '../src/shared/types/domain';
import type {
  CommitImportRequest,
  DesktopApi,
  ExportRequest,
  ExportResult,
  PreviewImportRequest
} from '../src/shared/types/ipc';

const api: DesktopApi = {
  getBootstrap: () => ipcRenderer.invoke('app:getBootstrap'),
  listSamples: (filters: SampleFilters) => ipcRenderer.invoke('samples:list', filters),
  getSample: (id: string) => ipcRenderer.invoke('samples:get', id),
  saveAnnotation: (input: SaveAnnotationInput) => ipcRenderer.invoke('annotation:save', input),
  saveSettings: (input: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', input),
  saveTaxonomy: (taxonomy: TaxonomyConfig) => ipcRenderer.invoke('taxonomy:save', taxonomy),
  openManifestFile: () => ipcRenderer.invoke('dialog:openManifest'),
  openDirectory: (defaultPath?: string | null) => ipcRenderer.invoke('dialog:openDirectory', defaultPath),
  previewImport: (request: PreviewImportRequest) => ipcRenderer.invoke('import:preview', request),
  commitImport: (request: CommitImportRequest) => ipcRenderer.invoke('import:commit', request),
  exportDataset: (request: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke('export:run', request),
  toFileUrl: (filePath: string) => ipcRenderer.invoke('path:toFileUrl', filePath)
};

contextBridge.exposeInMainWorld('desktop', api);
