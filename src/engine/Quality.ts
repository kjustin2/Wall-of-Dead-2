export type QualityTier = "low" | "medium" | "high";

export interface QualitySettings {
  tier: QualityTier;
  shadowMapSize: number;
  shadowBlurKernel: number;
  bloomEnabled: boolean;
  bloomKernel: number;
  ssaoEnabled: boolean;
  fogDensity: number;
  decalCap: number;
  shadowRefreshRate: number;
}

const KEY = "wod2.quality";

function settingsFor(tier: QualityTier): QualitySettings {
  if (tier === "low") {
    return {
      tier,
      shadowMapSize: 1024,
      shadowBlurKernel: 12,
      bloomEnabled: false,
      bloomKernel: 32,
      ssaoEnabled: false,
      fogDensity: 0.026,
      decalCap: 22,
      shadowRefreshRate: 3
    };
  }
  if (tier === "high") {
    return {
      tier,
      shadowMapSize: 4096,
      shadowBlurKernel: 34,
      bloomEnabled: true,
      bloomKernel: 96,
      ssaoEnabled: true,
      fogDensity: 0.032,
      decalCap: 80,
      shadowRefreshRate: 1
    };
  }
  return {
    tier: "medium",
    shadowMapSize: 2048,
    shadowBlurKernel: 22,
    bloomEnabled: true,
    bloomKernel: 64,
    ssaoEnabled: false,
    fogDensity: 0.029,
    decalCap: 48,
    shadowRefreshRate: 2
  };
}

let cached: QualitySettings | null = null;

function detectTier(): QualityTier {
  if (typeof document === "undefined") return "medium";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "low";
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return maxTex < 4096 ? "low" : "medium";
  } catch {
    return "medium";
  }
}

export function getQuality(): QualitySettings {
  if (cached) return cached;
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(KEY);
    if (raw === "low" || raw === "medium" || raw === "high") {
      cached = settingsFor(raw);
      return cached;
    }
  }
  cached = settingsFor(detectTier());
  return cached;
}

export function setQuality(tier: QualityTier): QualitySettings {
  cached = settingsFor(tier);
  try {
    localStorage.setItem(KEY, tier);
  } catch {
    // storage is optional
  }
  return cached;
}

export function cycleQuality(): QualitySettings {
  const tier = getQuality().tier;
  return setQuality(tier === "low" ? "medium" : tier === "medium" ? "high" : "low");
}
