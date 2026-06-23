/**
 * Checkpoint save system (localStorage). The game auto-saves at story beats; the
 * title screen offers CONTINUE when a save exists, and death reloads back to it.
 * A fresh boot rebuilds the world clean and then re-applies the saved flags, so a
 * restore never has to "undo" live state — see Director.restore().
 */
export interface SaveData {
  v: number;
  /** human-readable label of the checkpoint, shown on the title screen */
  beat: string;
  fuses: number;
  fuseA: boolean;
  fuseB: boolean;
  power: boolean;
  battery: number;
  bottles: number;
  /** cutscene flags already shown (so they don't replay on restore) */
  seen: string[];
  /** safe respawn: cell x, cell y, yaw */
  spawn: [number, number, number];
}

export interface Settings {
  quality?: "low" | "medium" | "high";
}

const KEY = "deadair.save.v1";
const SKEY = "deadair.settings.v1";

export const Save = {
  has(): boolean {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  },
  load(): SaveData | null {
    try {
      const s = localStorage.getItem(KEY);
      return s ? (JSON.parse(s) as SaveData) : null;
    } catch { return null; }
  },
  write(d: SaveData): void {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ }
  },
  clear(): void {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
  loadSettings(): Settings {
    try {
      const s = localStorage.getItem(SKEY);
      return s ? (JSON.parse(s) as Settings) : {};
    } catch { return {}; }
  },
  saveSettings(s: Settings): void {
    try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ }
  }
};
