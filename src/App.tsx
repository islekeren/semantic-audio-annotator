import { useEffect, useState } from 'react';
import {
  Download,
  FileUp,
  Gauge,
  HelpCircle,
  ListChecks,
  Settings as SettingsIcon
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type Screen } from './app/useAppStore';
import { ImportScreen } from './features/dataset/ImportScreen';
import { AnnotationWorkspace } from './features/annotation/AnnotationWorkspace';
import { ExportScreen } from './features/export/ExportScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ShortcutModal } from './components/ShortcutModal';

const SCREEN_ITEMS: Array<{
  id: Screen;
  label: string;
  description: string;
  icon: typeof FileUp;
}> = [
  { id: 'import', label: 'Import', description: 'Load local manifests', icon: FileUp },
  { id: 'annotate', label: 'Annotate', description: 'Main labeling workspace', icon: Gauge },
  { id: 'review', label: 'Review', description: 'Inspect weak items', icon: ListChecks },
  { id: 'export', label: 'Export', description: 'Generate ML manifests', icon: Download },
  { id: 'settings', label: 'Settings', description: 'Storage and taxonomy', icon: SettingsIcon }
];

export default function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const {
    initialize,
    initialized,
    isBusy,
    screen,
    setScreen,
    setFilters,
    navigationGuard,
    stats,
    errorMessage
  } = useAppStore(
    useShallow((state) => ({
      initialize: state.initialize,
      initialized: state.initialized,
      isBusy: state.isBusy,
      screen: state.screen,
      setScreen: state.setScreen,
      setFilters: state.setFilters,
      navigationGuard: state.navigationGuard,
      stats: state.stats,
      errorMessage: state.errorMessage
    }))
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function handleScreenChange(next: Screen) {
    if (navigationGuard) {
      const canNavigate = await navigationGuard();
      if (!canNavigate) {
        return;
      }
    }

    if (next === 'review') {
      await setFilters({ reviewOnly: true, flaggedOnly: false });
    }

    if (next === 'annotate') {
      await setFilters({ reviewOnly: false, flaggedOnly: false });
    }

    setScreen(next);
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-panel">
          <p className="eyebrow">Research Prototype</p>
          <h1>Semantic Audio Annotator</h1>
          <p className="muted">
            Local-first caption and attribute annotation for audio-text dataset curation.
          </p>
        </div>

        <div className="stats-grid">
          <StatCard label="Total" value={stats.totalSamples} />
          <StatCard label="Done" value={`${stats.progressPercent}%`} />
          <StatCard label="Review" value={stats.needsReviewCount} />
          <StatCard label="Left" value={stats.remainingCount} />
        </div>

        <nav className="screen-nav">
          {SCREEN_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === screen;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => void handleScreenChange(item.id)}
              >
                <span className="nav-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <button type="button" className="shortcut-button" onClick={() => setShowShortcuts(true)}>
          <HelpCircle size={16} />
          <span>Keyboard shortcuts</span>
        </button>
      </aside>

      <main className="app-content">
        <header className="content-header">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2>{getScreenTitle(screen)}</h2>
          </div>
          <div className="status-strip">
            {isBusy || !initialized ? <span className="status-pill">Loading workspace…</span> : null}
            {errorMessage ? <span className="status-pill warning">{errorMessage}</span> : null}
          </div>
        </header>

        <section className="content-body">
          {screen === 'import' ? <ImportScreen onComplete={() => void handleScreenChange('annotate')} /> : null}
          {screen === 'annotate' ? <AnnotationWorkspace mode="annotate" /> : null}
          {screen === 'review' ? <AnnotationWorkspace mode="review" /> : null}
          {screen === 'export' ? <ExportScreen /> : null}
          {screen === 'settings' ? <SettingsScreen /> : null}
        </section>
      </main>

      <ShortcutModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

function StatCard(props: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function getScreenTitle(screen: Screen): string {
  switch (screen) {
    case 'import':
      return 'Dataset Import';
    case 'annotate':
      return 'Annotation Workspace';
    case 'review':
      return 'Review Queue';
    case 'export':
      return 'Export Tools';
    case 'settings':
      return 'Settings';
    default:
      return 'Workspace';
  }
}
