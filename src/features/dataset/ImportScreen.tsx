import { useState } from 'react';
import type { ImportPreviewResult } from '../../shared/types/domain';
import { useAppStore } from '../../app/useAppStore';

type ImportScreenProps = {
  onComplete: () => void;
};

export function ImportScreen({ onComplete }: ImportScreenProps) {
  const initialize = useAppStore((state) => state.initialize);
  const settings = useAppStore((state) => state.settings);
  const [manifestPath, setManifestPath] = useState('');
  const [baseDirectory, setBaseDirectory] = useState(settings.audioBaseDirectory ?? '');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function handleBrowseManifest() {
    const selected = await window.desktop.openManifestFile();
    if (selected) {
      setManifestPath(selected);
      setStatusMessage(null);
    }
  }

  async function handleBrowseBaseDirectory() {
    const selected = await window.desktop.openDirectory(baseDirectory || settings.audioBaseDirectory);
    if (selected) {
      setBaseDirectory(selected);
      setStatusMessage(null);
    }
  }

  async function handlePreview() {
    if (!manifestPath.trim()) {
      setStatusMessage('Choose a CSV or JSON manifest first.');
      return;
    }

    setIsWorking(true);
    try {
      const result = await window.desktop.previewImport({
        manifestPath,
        baseDirectory: baseDirectory.trim() || undefined
      });
      setPreview(result);
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Import preview failed.');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleImport() {
    if (!preview) {
      setStatusMessage('Run validation before importing.');
      return;
    }

    setIsWorking(true);
    try {
      const result = await window.desktop.commitImport({
        manifestPath,
        baseDirectory: baseDirectory.trim() || undefined
      });
      await initialize();
      setStatusMessage(
        `Imported ${result.importedCount} rows. Skipped ${result.skippedCount}. Updated ${result.updatedCount}.`
      );
      onComplete();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="screen-grid single">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Manifest Intake</p>
            <h3>Import a local dataset</h3>
          </div>
          <div className="header-actions">
            <button type="button" className="ghost-button" onClick={handleBrowseManifest}>
              Choose manifest
            </button>
            <button type="button" className="ghost-button" onClick={handleBrowseBaseDirectory}>
              Choose audio base dir
            </button>
          </div>
        </div>

        <div className="form-grid two">
          <label className="field">
            <span>Manifest file</span>
            <input value={manifestPath} onChange={(event) => setManifestPath(event.target.value)} />
          </label>

          <label className="field">
            <span>Audio base directory</span>
            <input value={baseDirectory} onChange={(event) => setBaseDirectory(event.target.value)} />
          </label>
        </div>

        <div className="callout">
          <strong>Supported formats:</strong> CSV is required for v1, JSON is also supported. Relative audio paths are
          resolved against the base directory when provided, otherwise against the manifest folder.
        </div>

        <div className="header-actions">
          <button type="button" className="primary-button" onClick={() => void handlePreview()} disabled={isWorking}>
            Validate manifest
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleImport()}
            disabled={!preview || preview.validRows === 0 || isWorking}
          >
            Import valid rows
          </button>
        </div>

        {statusMessage ? <p className="feedback-line">{statusMessage}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Validation Report</p>
            <h3>Preview results</h3>
          </div>
        </div>

        {preview ? (
          <>
            <div className="stats-grid wide">
              <SummaryCard label="Rows" value={preview.totalRows} />
              <SummaryCard label="Valid" value={preview.validRows} />
              <SummaryCard label="Invalid" value={preview.invalidRows} />
              <SummaryCard label="Warnings" value={preview.warnings} />
              <SummaryCard label="Updates" value={preview.updatingExistingCount} />
            </div>

            <div className="metadata-grid">
              <div>
                <span className="meta-label">Detected base directory</span>
                <code>{preview.detectedBaseDirectory}</code>
              </div>
              <div>
                <span className="meta-label">Columns</span>
                <p>{preview.columns.join(', ') || 'No columns detected'}</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Audio ID</th>
                    <th>Action</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.reportRows.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No issues found. The manifest is ready to import.</td>
                    </tr>
                  ) : (
                    preview.reportRows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.audioId ?? row.filename ?? 'row'}`}>
                        <td>{row.rowNumber}</td>
                        <td>{row.audioId ?? row.filename ?? 'Unknown'}</td>
                        <td>
                          <span className={`status-pill ${row.severity === 'error' ? 'warning' : ''}`}>
                            {row.action}
                          </span>
                        </td>
                        <td>{row.issues.join(' ')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h4>No preview yet</h4>
            <p>Choose a manifest, run validation, and the import summary will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard(props: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
