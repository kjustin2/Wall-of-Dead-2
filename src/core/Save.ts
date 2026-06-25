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
  /** torch on/off at the checkpoint (optional; older saves resume torch-off) */
  lightOn?: boolean;
  /** creature awareness 0..2 at the checkpoint (optional; older saves infer it) */
  alert?: number;
  /** one-time event flags already fired (cutscenes + one-shot subtitles/stingers),
   *  so nothing replays after a restore */
  seen: string[];
  /** safe respawn: cell x, cell y, yaw */
  spawn: [number, number, number];
}

export interface Settings {
  quality?: "low" | "medium" | "high";
  /** preferred display mode — restored on the next start gesture */
  fullscreen?: boolean;
  /** internal render-resolution multiplier (0.5 / 0.75 / 1) */
  renderScale?: number;
  /** tone-mapping brightness multiplier (~0.7..1.4) */
  brightness?: number;
  /** base vertical field-of-view in degrees */
  fov?: number;
  /** mouse-look sensitivity multiplier (1 = default) */
  sensitivity?: number;
  /** invert vertical look */
  invertY?: boolean;
  /** master audio volume, 0..1 */
  volume?: number;
  /** per-category audio mix, 0..1 (ambience / creature / broadcast voice / music) */
  volAmbient?: number;
  volCreature?: number;
  volVoice?: number;
  volMusic?: number;
}

const KEY = "deadair.save.v1";
const SKEY = "deadair.settings.v1";

export const Save = {
  has(): boolean {
    return !!this.load();
  },
  load(): SaveData | null {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return null;
      const d = JSON.parse(s) as SaveData;
      // reject anything not in the current shape so a corrupt / older-format save
      // can't drive a NaN spawn through collision + the AI on CONTINUE
      if (!d || d.v !== 1 || !Array.isArray(d.spawn) || d.spawn.length < 3 ||
          d.spawn.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
      return d;
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
