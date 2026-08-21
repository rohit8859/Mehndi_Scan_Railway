export interface ScanProgress {
  active: boolean;
  total: number;
  processed: number;
  currentFile: string;
  errors: string[];
}

// Global mutable progress state, persistent within the running Node.js process
export const scanProgress: ScanProgress = {
  active: false,
  total: 0,
  processed: 0,
  currentFile: '',
  errors: [],
};

export function resetProgress() {
  scanProgress.active = true;
  scanProgress.total = 0;
  scanProgress.processed = 0;
  scanProgress.currentFile = '';
  scanProgress.errors = [];
}

export function stopProgress() {
  scanProgress.active = false;
}
