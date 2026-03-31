import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../app/useAppStore';
import defaultTaxonomy from '../../shared/config/defaultTaxonomy';
import type { TaxonomyConfig } from '../../shared/types/domain';

export function SettingsScreen() {
  const { settings, taxonomy, storagePath, userDataPath, saveSettings, saveTaxonomy } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      taxonomy: state.taxonomy,
      storagePath: state.storagePath,
      userDataPath: state.userDataPath,
      saveSettings: state.saveSettings,
      saveTaxonomy: state.saveTaxonomy
    }))
  );

  const [audioBaseDirectory, setAudioBaseDirectory] = useState(settings.audioBaseDirectory ?? '');
  const [exportDirectory, setExportDirectory] = useState(settings.exportDirectory ?? '');
  const [activeAnnotatorId, setActiveAnnotatorId] = useState(settings.activeAnnotatorId);
  const [autosaveEnabled, setAutosaveEnabled] = useState(settings.autosaveEnabled);
  const [taxonomyJson, setTaxonomyJson] = useState(JSON.stringify(taxonomy, null, 2));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAudioBaseDirectory(settings.audioBaseDirectory ?? '');
    setExportDirectory(settings.exportDirectory ?? '');
    setActiveAnnotatorId(settings.activeAnnotatorId);
    setAutosaveEnabled(settings.autosaveEnabled);
  }, [settings]);

  useEffect(() => {
    setTaxonomyJson(JSON.stringify(taxonomy, null, 2));
  }, [taxonomy]);

  async function chooseAudioBaseDirectory() {
    const selected = await window.desktop.openDirectory(audioBaseDirectory || settings.audioBaseDirectory);
    if (selected) {
      setAudioBaseDirectory(selected);
    }
  }

  async function chooseExportDirectory() {
    const selected = await window.desktop.openDirectory(exportDirectory || settings.exportDirectory);
    if (selected) {
      setExportDirectory(selected);
    }
  }

  async function handleSaveSettings() {
    try {
      await saveSettings({
        audioBaseDirectory: audioBaseDirectory.trim() || null,
        exportDirectory: exportDirectory.trim() || null,
        activeAnnotatorId: activeAnnotatorId.trim() || 'local-user',
        autosaveEnabled
      });
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save settings.');
    }
  }

  async function handleSaveTaxonomy() {
    try {
      const parsed = JSON.parse(taxonomyJson) as TaxonomyConfig;
      validateTaxonomy(parsed);
      await saveTaxonomy(parsed);
      setMessage('Taxonomy saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Taxonomy JSON is invalid.');
    }
  }

  return (
    <div className="screen-grid two-columns">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h3>Storage and defaults</h3>
          </div>
        </div>

        <div className="form-grid two">
          <label className="field">
            <span>Audio base directory</span>
            <input value={audioBaseDirectory} onChange={(event) => setAudioBaseDirectory(event.target.value)} />
          </label>
          <button type="button" className="ghost-button align-end" onClick={() => void chooseAudioBaseDirectory()}>
            Choose folder
          </button>

          <label className="field">
            <span>Export directory</span>
            <input value={exportDirectory} onChange={(event) => setExportDirectory(event.target.value)} />
          </label>
          <button type="button" className="ghost-button align-end" onClick={() => void chooseExportDirectory()}>
            Choose folder
          </button>

          <label className="field">
            <span>Active annotator ID</span>
            <input value={activeAnnotatorId} onChange={(event) => setActiveAnnotatorId(event.target.value)} />
          </label>

          <label className="checkbox-line align-end">
            <input
              type="checkbox"
              checked={autosaveEnabled}
              onChange={(event) => setAutosaveEnabled(event.target.checked)}
            />
            <span>Autosave annotations</span>
          </label>
        </div>

        <div className="metadata-grid">
          <div>
            <span className="meta-label">SQLite database</span>
            <code>{storagePath}</code>
          </div>
          <div>
            <span className="meta-label">User data directory</span>
            <code>{userDataPath}</code>
          </div>
        </div>

        <button type="button" className="primary-button" onClick={() => void handleSaveSettings()}>
          Save settings
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Taxonomy</p>
            <h3>Editable annotation vocabulary</h3>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setTaxonomyJson(JSON.stringify(defaultTaxonomy, null, 2))}
          >
            Reset editor to defaults
          </button>
        </div>

        <label className="field">
          <span>Taxonomy JSON</span>
          <textarea
            className="code-area"
            value={taxonomyJson}
            onChange={(event) => setTaxonomyJson(event.target.value)}
          />
        </label>

        <button type="button" className="secondary-button" onClick={() => void handleSaveTaxonomy()}>
          Save taxonomy
        </button>

        {message ? <p className="feedback-line">{message}</p> : null}
      </section>
    </div>
  );
}

function validateTaxonomy(taxonomy: TaxonomyConfig): void {
  const keys: Array<keyof TaxonomyConfig> = ['soundTypes', 'moods', 'timbres', 'motions', 'useCases'];
  keys.forEach((key) => {
    if (!Array.isArray(taxonomy[key])) {
      throw new Error(`Taxonomy field ${key} must be an array.`);
    }
  });
}
