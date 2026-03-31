import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, net, protocol, type OpenDialogOptions } from 'electron';
import type { BootstrapPayload, SaveAnnotationInput } from '../src/shared/types/domain';
import type { CommitImportRequest, ExportRequest, PreviewImportRequest } from '../src/shared/types/ipc';
import { AppDatabase } from './database/AppDatabase';
import { ExportService } from './services/exportService';
import { ImportService } from './services/importService';

let mainWindow: BrowserWindow | null = null;
const LOCAL_MEDIA_SCHEME = 'local-media';

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const databasePath = path.join(app.getPath('userData'), 'semantic-audio-annotator.sqlite');
const database = new AppDatabase(databasePath);
const importService = new ImportService(database);
const exportService = new ExportService(database);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1320,
    minHeight: 840,
    title: 'Semantic Audio Annotator',
    backgroundColor: '#f4efe4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  } else {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createLocalMediaUrl(filePath: string): string {
  return `${LOCAL_MEDIA_SCHEME}://audio?path=${encodeURIComponent(filePath)}`;
}

function registerLocalMediaProtocol(): void {
  protocol.handle(LOCAL_MEDIA_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    const filePath = requestUrl.searchParams.get('path');

    if (!filePath) {
      return new Response('Missing media path.', { status: 400 });
    }

    const normalizedPath = path.normalize(filePath);
    if (!path.isAbsolute(normalizedPath)) {
      return new Response('Media path must be absolute.', { status: 400 });
    }

    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isFile()) {
      return new Response('Media file not found.', { status: 404 });
    }

    return net.fetch(pathToFileURL(normalizedPath).toString());
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:getBootstrap', (): BootstrapPayload => ({
    settings: database.getSettings(),
    taxonomy: database.getTaxonomy(),
    stats: database.getStats(),
    sources: database.getDistinctSources(),
    storagePath: database.path,
    userDataPath: app.getPath('userData')
  }));

  ipcMain.handle('samples:list', (_event, filters) => database.listSamples(filters));
  ipcMain.handle('samples:get', (_event, id: string) => database.getSampleById(id));
  ipcMain.handle('annotation:save', (_event, input: SaveAnnotationInput) => {
    const detail = database.saveAnnotation(input);
    return {
      detail,
      stats: database.getStats(input.annotatorId)
    };
  });
  ipcMain.handle('settings:save', (_event, input) => database.saveSettings(input));
  ipcMain.handle('taxonomy:save', (_event, taxonomy) => database.saveTaxonomy(taxonomy));

  ipcMain.handle('dialog:openManifest', async () => {
    const options: OpenDialogOptions = {
      title: 'Choose dataset manifest',
      properties: ['openFile'],
      filters: [
        { name: 'Supported manifests', extensions: ['csv', 'json'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openDirectory', async (_event, defaultPath?: string | null) => {
    const options: OpenDialogOptions = {
      title: 'Choose directory',
      defaultPath: defaultPath ?? undefined,
      properties: ['openDirectory', 'createDirectory']
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('import:preview', (_event, request: PreviewImportRequest) =>
    importService.previewManifest(request)
  );
  ipcMain.handle('import:commit', (_event, request: CommitImportRequest) => importService.commitImport(request));
  ipcMain.handle('export:run', async (_event, request: ExportRequest) => {
    if (!mainWindow) {
      return null;
    }
    return exportService.exportDataset(mainWindow, request);
  });
  ipcMain.handle('path:toMediaUrl', (_event, filePath: string) => createLocalMediaUrl(filePath));
}

app.whenReady().then(() => {
  registerLocalMediaProtocol();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
