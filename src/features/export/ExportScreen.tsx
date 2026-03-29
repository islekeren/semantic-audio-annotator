import { useState } from 'react';
import { useAppStore } from '../../app/useAppStore';
import type { AnnotationStatus, ExportFormat, ExportKind } from '../../shared/types/domain';

const EXPORTABLE_STATUSES: AnnotationStatus[] = ['annotated', 'needs_review', 'rejected'];

export function ExportScreen() {
  const settings = useAppStore((state) => state.settings);
  const stats = useAppStore((state) => state.stats);
  const [statuses, setStatuses] = useState<AnnotationStatus[]>(['annotated']);
  const [minConfidence, setMinConfidence] = useState<number | null>(3);
  const [excludeFlagged, setExcludeFlagged] = useState(true);
  const [requireCaption, setRequireCaption] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function runExport(kind: ExportKind, format: ExportFormat) {
    setIsWorking(true);
    try {
      const result = await window.desktop.exportDataset({
        kind,
        format,
        options: {
          statuses,
          minConfidence,
          excludeFlagged,
          requireCaption,
          annotatorId: settings.activeAnnotatorId
        }
      });

      if (result) {
        setMessage(`Exported ${result.rowCount} rows to ${result.targetPath}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setIsWorking(false);
    }
  }

  function toggleStatus(status: AnnotationStatus) {
    setStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    );
  }

  return (
    <div className="screen-grid two-columns">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Curation Output</p>
            <h3>Export manifests</h3>
          </div>
        </div>

        <div className="stack">
          <div className="field-group">
            <span className="field-label">Statuses to include</span>
            <div className="token-grid">
              {EXPORTABLE_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`token ${statuses.includes(status) ? 'selected' : ''}`}
                  onClick={() => toggleStatus(status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid two">
            <label className="field">
              <span>Minimum confidence</span>
              <select
                value={minConfidence ?? ''}
                onChange={(event) => setMinConfidence(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Any confidence</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} and above
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={excludeFlagged}
              onChange={(event) => setExcludeFlagged(event.target.checked)}
            />
            <span>Exclude rows flagged as hallucinated, unclear, or license-sensitive</span>
          </label>

          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={requireCaption}
              onChange={(event) => setRequireCaption(event.target.checked)}
            />
            <span>Require a non-empty final caption</span>
          </label>
        </div>

        <div className="header-actions wrap">
          <button type="button" className="primary-button" disabled={isWorking} onClick={() => void runExport('pairs', 'csv')}>
            Export pairs CSV
          </button>
          <button type="button" className="secondary-button" disabled={isWorking} onClick={() => void runExport('pairs', 'json')}>
            Export pairs JSON
          </button>
          <button type="button" className="secondary-button" disabled={isWorking} onClick={() => void runExport('rich', 'csv')}>
            Export rich CSV
          </button>
          <button type="button" className="secondary-button" disabled={isWorking} onClick={() => void runExport('rich', 'json')}>
            Export rich JSON
          </button>
          <button type="button" className="ghost-button" disabled={isWorking} onClick={() => void runExport('summary', 'json')}>
            Export summary JSON
          </button>
        </div>

        {message ? <p className="feedback-line">{message}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Readiness</p>
            <h3>Current dataset snapshot</h3>
          </div>
        </div>

        <div className="stats-grid wide">
          <SummaryCard label="Annotated" value={stats.annotatedCount} />
          <SummaryCard label="Needs review" value={stats.needsReviewCount} />
          <SummaryCard label="Rejected" value={stats.rejectedCount} />
          <SummaryCard label="Progress" value={`${stats.progressPercent}%`} />
        </div>

        <div className="callout">
          <p>
            Use <strong>pairs</strong> when you want a clean audio-text training manifest. Use <strong>rich</strong>{' '}
            when you want structured attributes, confidence, and review metadata for downstream analysis.
          </p>
          <p>Current annotator scope: <code>{settings.activeAnnotatorId}</code></p>
        </div>
      </section>
    </div>
  );
}

function SummaryCard(props: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
