/// <reference types="vite/client" />

import type { DesktopApi } from './shared/types/ipc';

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
