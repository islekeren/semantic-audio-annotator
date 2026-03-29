import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import type {
  CaptionActionType,
  SampleDetail,
  SaveAnnotationInput,
  TaxonomyConfig
} from '../../shared/types/domain';

type AnnotationEditorProps = {
  sample: SampleDetail | null;
  taxonomy: TaxonomyConfig;
  autosaveEnabled: boolean;
  annotatorId: string;
  onSave: (input: SaveAnnotationInput) => Promise<void>;
  onSaveAndNext: () => Promise<void>;
};

export type AnnotationEditorHandle = {
  flushPending: () => Promise<boolean>;
  focusCaption: () => void;
  applyShortcut: (action: 'approve' | 'needs_review' | 'unusable') => Promise<void>;
};

export const AnnotationEditor = forwardRef<AnnotationEditorHandle, AnnotationEditorProps>(function AnnotationEditor(
  { sample, taxonomy, autosaveEnabled, annotatorId, onSave, onSaveAndNext },
  ref
) {
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef<SaveAnnotationInput | null>(null);
  const skipAutosaveRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);

  const [draft, setDraft] = useState<SaveAnnotationInput | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Ready');

  useEffect(() => {
    if (!sample) {
      setDraft(null);
      draftRef.current = null;
      setIsDirty(false);
      setSaveMessage('No sample selected');
      return;
    }

    const nextDraft = makeDraft(sample, annotatorId);
    skipAutosaveRef.current = true;
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    setIsDirty(false);
    setSaveMessage('Ready');
  }, [annotatorId, sample?.annotation.updatedAt, sample?.audioItem.id]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!draft || skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    setIsDirty(true);

    if (!autosaveEnabled) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persistDraft();
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [autosaveEnabled, draft]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useImperativeHandle(ref, () => ({
    flushPending: async () => {
      if (!draftRef.current) {
        return true;
      }

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (!isDirty) {
        return true;
      }

      return persistDraft(true);
    },
    focusCaption: () => {
      captionRef.current?.focus();
    },
    applyShortcut: async (action) => {
      if (!draftRef.current) {
        return;
      }

      if (action === 'approve') {
        updateDraft((current) => ({
          ...current,
          captionActionType: 'approved',
          status: 'annotated',
          captionFinal:
            current.captionFinal.trim().length > 0
              ? current.captionFinal
              : sample?.audioItem.candidateCaption ?? current.captionFinal
        }));
      }

      if (action === 'needs_review') {
        updateDraft((current) => ({
          ...current,
          status: 'needs_review'
        }));
      }

      if (action === 'unusable') {
        updateDraft((current) => ({
          ...current,
          captionActionType: 'unusable',
          status: 'rejected'
        }));
      }

      await persistDraft(true);
    }
  }));

  async function persistDraft(force = false): Promise<boolean> {
    if (!draftRef.current) {
      return true;
    }

    if (!force && !isDirty) {
      return true;
    }

    setIsSaving(true);
    setSaveMessage('Saving…');

    try {
      await onSave(draftRef.current);
      setIsDirty(false);
      setSaveMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      return true;
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Save failed.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function updateDraft(updater: (current: SaveAnnotationInput) => SaveAnnotationInput) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);
      draftRef.current = next;
      return next;
    });
  }

  if (!sample || !draft) {
    return (
      <div className="panel fill">
        <div className="empty-state">
          <h4>No sample selected</h4>
          <p>Import a dataset or choose a sample from the list to start annotating.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel fill">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Annotation Form</p>
          <h3>Human-reviewed caption and attributes</h3>
        </div>
        <span className={`status-pill ${isSaving ? '' : 'success'}`}>{saveMessage}</span>
      </div>

      <div className="stack">
        <div className="callout soft">
          <strong>Candidate caption</strong>
          <p>{sample.audioItem.candidateCaption ?? 'No machine caption available for this sample.'}</p>
        </div>

        <div className="field-group">
          <span className="field-label">Caption action</span>
          <div className="token-grid">
            {(['approved', 'edited', 'rewritten', 'unusable'] as CaptionActionType[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`token ${draft.captionActionType === value ? 'selected' : ''}`}
                onClick={() => updateDraft((current) => ({ ...current, captionActionType: value }))}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Final caption</span>
          <textarea
            ref={captionRef}
            value={draft.captionFinal}
            onChange={(event) => updateDraft((current) => ({ ...current, captionFinal: event.target.value }))}
            placeholder="Write a concise, semantic description of the sound."
          />
        </label>

        <label className="field">
          <span>Longer description</span>
          <textarea
            value={draft.captionLong}
            onChange={(event) => updateDraft((current) => ({ ...current, captionLong: event.target.value }))}
            placeholder="Optional detailed note about texture, behavior, or context."
          />
        </label>

        <div className="field-group">
          <span className="field-label">Task status</span>
          <div className="token-grid">
            {(['unannotated', 'in_progress', 'annotated', 'needs_review', 'rejected'] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={`token ${draft.status === status ? 'selected' : ''}`}
                onClick={() => updateDraft((current) => ({ ...current, status }))}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid two">
          <label className="field">
            <span>Sound type</span>
            <select
              value={draft.soundType ?? ''}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  soundType: event.target.value || null
                }))
              }
            >
              <option value="">Select type</option>
              {taxonomy.soundTypes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Motion</span>
            <select
              value={draft.motion ?? ''}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  motion: event.target.value || null
                }))
              }
            >
              <option value="">Select motion</option>
              {taxonomy.motions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <TokenSelector
          label="Mood"
          options={taxonomy.moods}
          values={draft.moods}
          onToggle={(value) =>
            updateDraft((current) => ({ ...current, moods: toggleValue(current.moods, value) }))
          }
        />

        <TokenSelector
          label="Timbre / texture"
          options={taxonomy.timbres}
          values={draft.timbres}
          onToggle={(value) =>
            updateDraft((current) => ({ ...current, timbres: toggleValue(current.timbres, value) }))
          }
        />

        <TokenSelector
          label="Use case / context"
          options={taxonomy.useCases}
          values={draft.useCases}
          onToggle={(value) =>
            updateDraft((current) => ({ ...current, useCases: toggleValue(current.useCases, value) }))
          }
        />

        <div className="field-group">
          <span className="field-label">Confidence</span>
          <div className="token-grid">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`token ${draft.confidence === value ? 'selected' : ''}`}
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    confidence: current.confidence === value ? null : value
                  }))
                }
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid two">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={draft.llmCaptionIncorrect}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, llmCaptionIncorrect: event.target.checked }))
              }
            />
            <span>LLM caption incorrect / hallucinated</span>
          </label>

          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={draft.audioUnclear}
              onChange={(event) => updateDraft((current) => ({ ...current, audioUnclear: event.target.checked }))}
            />
            <span>Audio unclear / low quality</span>
          </label>

          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={draft.licenseConcern}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, licenseConcern: event.target.checked }))
              }
            />
            <span>Copyright or licensing concern</span>
          </label>
        </div>

        <label className="field">
          <span>Review notes</span>
          <textarea
            value={draft.reviewNotes}
            onChange={(event) => updateDraft((current) => ({ ...current, reviewNotes: event.target.value }))}
            placeholder="Optional note for later curation or disagreement review."
          />
        </label>

        <div className="header-actions wrap">
          <button type="button" className="primary-button" disabled={isSaving} onClick={() => void persistDraft(true)}>
            Save
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving}
            onClick={() => void onSaveAndNext()}
          >
            Save and next
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={isSaving}
            onClick={() => void updateDraft((current) => ({ ...current, status: 'needs_review' }))}
          >
            Mark needs review
          </button>
        </div>
      </div>
    </div>
  );
});

function TokenSelector(props: {
  label: string;
  options: string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="field-group">
      <span className="field-label">{props.label}</span>
      <div className="token-grid">
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`token ${props.values.includes(option) ? 'selected' : ''}`}
            onClick={() => props.onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function makeDraft(sample: SampleDetail, annotatorId: string): SaveAnnotationInput {
  return {
    audioItemId: sample.audioItem.id,
    annotatorId,
    captionFinal: sample.annotation.captionFinal,
    captionLong: sample.annotation.captionLong,
    captionActionType: sample.annotation.captionActionType,
    soundType: sample.annotation.soundType,
    moods: [...sample.annotation.moods],
    timbres: [...sample.annotation.timbres],
    motion: sample.annotation.motion,
    useCases: [...sample.annotation.useCases],
    confidence: sample.annotation.confidence,
    llmCaptionIncorrect: sample.annotation.llmCaptionIncorrect,
    audioUnclear: sample.annotation.audioUnclear,
    licenseConcern: sample.annotation.licenseConcern,
    reviewNotes: sample.annotation.reviewNotes,
    status: sample.annotation.status
  };
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
