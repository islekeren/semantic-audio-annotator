import { useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import { useAppStore } from '../../app/useAppStore';
import type { AnnotationStatus } from '../../shared/types/domain';
import { AnnotationEditor, type AnnotationEditorHandle } from './AnnotationEditor';
import { AudioPlayer, type AudioPlayerHandle } from './AudioPlayer';

type AnnotationWorkspaceProps = {
  mode: 'annotate' | 'review';
};

const STATUS_OPTIONS: AnnotationStatus[] = [
  'unannotated',
  'in_progress',
  'annotated',
  'needs_review',
  'rejected'
];

export function AnnotationWorkspace({ mode }: AnnotationWorkspaceProps) {
  const {
    filters,
    samples,
    currentSample,
    currentSampleId,
    settings,
    taxonomy,
    stats,
    sources,
    setFilters,
    selectSample,
    saveAnnotation,
    setNavigationGuard
  } = useAppStore((state) => ({
    filters: state.filters,
    samples: state.samples,
    currentSample: state.currentSample,
    currentSampleId: state.currentSampleId,
    settings: state.settings,
    taxonomy: state.taxonomy,
    stats: state.stats,
    sources: state.sources,
    setFilters: state.setFilters,
    selectSample: state.selectSample,
    saveAnnotation: state.saveAnnotation,
    setNavigationGuard: state.setNavigationGuard
  }));

  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const editorRef = useRef<AnnotationEditorHandle | null>(null);
  const currentIndex = samples.findIndex((item) => item.id === currentSampleId);
  const selectedSample = currentIndex >= 0 ? samples[currentIndex] : null;

  const reviewHeadline = useMemo(
    () =>
      mode === 'review'
        ? 'Prioritize low-confidence, flagged, or rejected items for a second pass.'
        : 'Move sample by sample, keep captions semantic, and use structured tags for consistency.',
    [mode]
  );

  useEffect(() => {
    setNavigationGuard(async () => (editorRef.current ? editorRef.current.flushPending() : true));
    return () => setNavigationGuard(null);
  }, [setNavigationGuard]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void editorRef.current?.flushPending();
        return;
      }

      if (!typingTarget && event.key === ' ') {
        event.preventDefault();
        playerRef.current?.togglePlay();
        return;
      }

      if (!typingTarget && (event.key === 'ArrowRight' || event.key.toLowerCase() === 'n')) {
        event.preventDefault();
        void navigateByOffset(1);
        return;
      }

      if (!typingTarget && (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'p')) {
        event.preventDefault();
        void navigateByOffset(-1);
        return;
      }

      if (!typingTarget && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        void editorRef.current?.applyShortcut('approve');
        return;
      }

      if (!typingTarget && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void editorRef.current?.applyShortcut('needs_review');
        return;
      }

      if (!typingTarget && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        void editorRef.current?.applyShortcut('unusable');
        return;
      }

      if (!typingTarget && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        editorRef.current?.focusCaption();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [currentIndex, samples, mode]);

  async function navigateToSample(id: string) {
    if (editorRef.current) {
      const canContinue = await editorRef.current.flushPending();
      if (!canContinue) {
        return;
      }
    }
    await selectSample(id);
  }

  async function navigateByOffset(offset: number) {
    if (currentIndex < 0) {
      return;
    }

    const next = samples[currentIndex + offset];
    if (!next) {
      return;
    }

    await navigateToSample(next.id);
  }

  async function handleSaveAndNext() {
    const saved = await editorRef.current?.flushPending();
    if (!saved) {
      return;
    }
    await navigateByOffset(1);
  }

  async function toggleStatus(status: AnnotationStatus) {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((value) => value !== status)
      : [...filters.statuses, status];
    await setFilters({ statuses });
  }

  return (
    <div className="workspace-grid">
      <section className="panel left-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{mode === 'review' ? 'Review Queue' : 'Dataset Browser'}</p>
            <h3>{mode === 'review' ? 'Inspect weak items' : 'Filter and navigate'}</h3>
          </div>
        </div>

        <p className="muted">{reviewHeadline}</p>

        <label className="search-field">
          <Search size={16} />
          <input
            value={filters.search}
            onChange={(event) => void setFilters({ search: event.target.value })}
            placeholder="Search by audio ID or filename"
          />
        </label>

        <div className="form-grid two">
          <label className="field">
            <span>Candidate caption</span>
            <select
              value={filters.candidateCaption}
              onChange={(event) =>
                void setFilters({
                  candidateCaption: event.target.value as typeof filters.candidateCaption
                })
              }
            >
              <option value="all">All</option>
              <option value="present">Has candidate</option>
              <option value="missing">No candidate</option>
            </select>
          </label>

          <label className="field">
            <span>Source dataset</span>
            <select value={filters.sourceDataset} onChange={(event) => void setFilters({ sourceDataset: event.target.value })}>
              <option value="all">All sources</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-group">
          <span className="field-label">Statuses</span>
          <div className="token-grid">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={`token ${filters.statuses.includes(status) ? 'selected' : ''}`}
                onClick={() => void toggleStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid two">
          <label className="field">
            <span>Confidence min</span>
            <select
              value={filters.confidenceMin ?? ''}
              onChange={(event) =>
                void setFilters({ confidenceMin: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}+
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tag filter</span>
            <input value={filters.tagQuery} onChange={(event) => void setFilters({ tagQuery: event.target.value })} />
          </label>
        </div>

        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={mode === 'review' ? true : filters.reviewOnly}
            onChange={(event) => void setFilters({ reviewOnly: event.target.checked })}
            disabled={mode === 'review'}
          />
          <span>Review queue only</span>
        </label>

        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={filters.flaggedOnly}
            onChange={(event) => void setFilters({ flaggedOnly: event.target.checked })}
          />
          <span>Only flagged samples</span>
        </label>

        <div className="queue-summary">
          <div>
            <span>Filtered samples</span>
            <strong>{samples.length}</strong>
          </div>
          <div>
            <span>Progress</span>
            <strong>{stats.progressPercent}%</strong>
          </div>
        </div>

        <div className="sample-list">
          {samples.length === 0 ? (
            <div className="empty-state compact">
              <h4>No matching samples</h4>
              <p>Adjust the filters or import more data.</p>
            </div>
          ) : (
            samples.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sample-row ${item.id === currentSampleId ? 'active' : ''}`}
                onClick={() => void navigateToSample(item.id)}
              >
                <div className="sample-row-main">
                  <strong>{item.filename}</strong>
                  <span>{item.id}</span>
                </div>
                <div className="sample-row-meta">
                  <span className={`status-pill ${item.status === 'needs_review' || item.status === 'rejected' ? 'warning' : ''}`}>
                    {item.status}
                  </span>
                  <small>{item.confidence ? `C${item.confidence}` : 'No confidence'}</small>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel center-column">
        {currentSample ? (
          <>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Current Sample</p>
                <h3>{currentSample.audioItem.filename}</h3>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={currentIndex <= 0}
                  onClick={() => void navigateByOffset(-1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={currentIndex < 0 || currentIndex >= samples.length - 1}
                  onClick={() => void navigateByOffset(1)}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="metadata-grid">
              <div>
                <span className="meta-label">Audio ID</span>
                <code>{currentSample.audioItem.id}</code>
              </div>
              <div>
                <span className="meta-label">Source</span>
                <p>{currentSample.audioItem.sourceDataset ?? 'Unknown'}</p>
              </div>
              <div>
                <span className="meta-label">Split</span>
                <p>{currentSample.audioItem.split ?? 'Unspecified'}</p>
              </div>
              <div>
                <span className="meta-label">License</span>
                <p>{currentSample.audioItem.license ?? 'Unspecified'}</p>
              </div>
            </div>

            <AudioPlayer
              ref={playerRef}
              audioPath={currentSample.audioItem.audioPath}
              durationHint={currentSample.audioItem.duration}
              playable={currentSample.audioItem.playable}
            />

            <div className="callout soft">
              <strong>Raw tags</strong>
              <p>{currentSample.audioItem.rawTags.join(', ') || 'No raw tags provided.'}</p>
            </div>

            <div className="callout">
              <strong>Manifest notes</strong>
              <p>{currentSample.audioItem.notes ?? 'No notes included in the imported manifest.'}</p>
            </div>

            <div className="callout soft">
              <strong>Audio path</strong>
              <code>{currentSample.audioItem.audioPath}</code>
            </div>

            <div className="queue-summary">
              <div>
                <span>Current position</span>
                <strong>{currentIndex >= 0 ? `${currentIndex + 1} / ${samples.length}` : `0 / ${samples.length}`}</strong>
              </div>
              <div>
                <span>Annotator</span>
                <strong>{settings.activeAnnotatorId}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h4>No sample selected</h4>
            <p>Choose a sample from the list or import a dataset to begin.</p>
          </div>
        )}
      </section>

      <AnnotationEditor
        ref={editorRef}
        sample={currentSample}
        taxonomy={taxonomy}
        autosaveEnabled={settings.autosaveEnabled}
        annotatorId={settings.activeAnnotatorId}
        onSave={saveAnnotation}
        onSaveAndNext={handleSaveAndNext}
      />
    </div>
  );
}
