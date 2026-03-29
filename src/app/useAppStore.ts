import { create } from 'zustand';
import type {
  AppSettings,
  BootstrapPayload,
  DatasetStats,
  SampleDetail,
  SampleFilters,
  SampleListItem,
  SaveAnnotationInput,
  TaxonomyConfig
} from '../shared/types/domain';
import defaultTaxonomy from '../shared/config/defaultTaxonomy';

export type Screen = 'import' | 'annotate' | 'review' | 'export' | 'settings';

export const DEFAULT_FILTERS: SampleFilters = {
  search: '',
  statuses: [],
  candidateCaption: 'all',
  sourceDataset: 'all',
  confidenceMin: null,
  confidenceMax: null,
  tagQuery: '',
  reviewOnly: false,
  flaggedOnly: false
};

type NavigationGuard = (() => Promise<boolean>) | null;

interface AppStore {
  initialized: boolean;
  screen: Screen;
  settings: AppSettings;
  taxonomy: TaxonomyConfig;
  stats: DatasetStats;
  sources: string[];
  storagePath: string;
  userDataPath: string;
  filters: SampleFilters;
  samples: SampleListItem[];
  currentSampleId: string | null;
  currentSample: SampleDetail | null;
  isBusy: boolean;
  errorMessage: string | null;
  navigationGuard: NavigationGuard;
  initialize: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  setNavigationGuard: (guard: NavigationGuard) => void;
  setFilters: (partial: Partial<SampleFilters>) => Promise<void>;
  refreshSamples: (preferredId?: string | null) => Promise<void>;
  selectSample: (id: string | null) => Promise<void>;
  saveAnnotation: (input: SaveAnnotationInput) => Promise<void>;
  saveSettings: (input: Partial<AppSettings>) => Promise<void>;
  saveTaxonomy: (taxonomy: TaxonomyConfig) => Promise<void>;
  setError: (message: string | null) => void;
}

const EMPTY_STATS: DatasetStats = {
  totalSamples: 0,
  annotatedCount: 0,
  inProgressCount: 0,
  remainingCount: 0,
  needsReviewCount: 0,
  rejectedCount: 0,
  progressPercent: 0
};

const DEFAULT_SETTINGS: AppSettings = {
  audioBaseDirectory: null,
  exportDirectory: null,
  autosaveEnabled: true,
  activeAnnotatorId: 'local-user',
  theme: 'light'
};

async function loadBootstrap(): Promise<BootstrapPayload> {
  return window.desktop.getBootstrap();
}

export const useAppStore = create<AppStore>((set, get) => ({
  initialized: false,
  screen: 'import',
  settings: DEFAULT_SETTINGS,
  taxonomy: defaultTaxonomy,
  stats: EMPTY_STATS,
  sources: [],
  storagePath: '',
  userDataPath: '',
  filters: DEFAULT_FILTERS,
  samples: [],
  currentSampleId: null,
  currentSample: null,
  isBusy: false,
  errorMessage: null,
  navigationGuard: null,

  initialize: async () => {
    set({ isBusy: true, errorMessage: null });
    try {
      const bootstrap = await loadBootstrap();
      set({
        initialized: true,
        settings: bootstrap.settings,
        taxonomy: bootstrap.taxonomy,
        stats: bootstrap.stats,
        sources: bootstrap.sources,
        storagePath: bootstrap.storagePath,
        userDataPath: bootstrap.userDataPath
      });
      await get().refreshSamples();
      if (bootstrap.stats.totalSamples > 0 && get().screen === 'import') {
        set({ screen: 'annotate' });
      }
    } catch (error) {
      set({
        errorMessage: error instanceof Error ? error.message : 'Failed to initialize the application.'
      });
    } finally {
      set({ isBusy: false });
    }
  },

  setScreen: (screen) => set({ screen }),

  setNavigationGuard: (guard) => set({ navigationGuard: guard }),

  setFilters: async (partial) => {
    const next = {
      ...get().filters,
      ...partial
    };
    set({ filters: next });
    await get().refreshSamples(get().currentSampleId);
  },

  refreshSamples: async (preferredId) => {
    const samples = await window.desktop.listSamples(get().filters);
    const currentSampleId =
      preferredId && samples.some((item) => item.id === preferredId)
        ? preferredId
        : samples[0]?.id ?? null;
    set({
      samples,
      currentSampleId
    });
    await get().selectSample(currentSampleId);
  },

  selectSample: async (id) => {
    if (!id) {
      set({ currentSampleId: null, currentSample: null });
      return;
    }

    const detail = await window.desktop.getSample(id);
    set({
      currentSampleId: id,
      currentSample: detail
    });
  },

  saveAnnotation: async (input) => {
    const response = await window.desktop.saveAnnotation(input);
    set({
      currentSample: response.detail,
      currentSampleId: response.detail.audioItem.id,
      stats: response.stats
    });
    await get().refreshSamples(response.detail.audioItem.id);
  },

  saveSettings: async (input) => {
    const settings = await window.desktop.saveSettings(input);
    set({ settings });
  },

  saveTaxonomy: async (taxonomy) => {
    const saved = await window.desktop.saveTaxonomy(taxonomy);
    set({ taxonomy: saved });
  },

  setError: (message) => set({ errorMessage: message })
}));
