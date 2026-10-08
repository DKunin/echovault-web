export type BrowserCompatibilityMode = "modern" | "fallback";

interface CompatibilitySignals {
  search: string;
  userAgent: string;
  supportsDynamicViewport: boolean;
}

const legacyTvPattern = /(?:Web0S|webOS|NetCast|SmartTV)/i;

function forcedCompatibilityMode(search: string): BrowserCompatibilityMode | null {
  const match = search.match(/(?:^|[?&])compat=(fallback|legacy|modern)(?:&|$)/i);
  if (!match) return null;
  return match[1].toLowerCase() === "modern" ? "modern" : "fallback";
}

export function resolveBrowserCompatibilityMode({
  search,
  userAgent,
  supportsDynamicViewport,
}: CompatibilitySignals): BrowserCompatibilityMode {
  const forced = forcedCompatibilityMode(search);
  if (forced) return forced;

  if (!supportsDynamicViewport) return "fallback";
  if (!legacyTvPattern.test(userAgent)) return "modern";

  const chromiumVersion = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i)?.[1];
  return !chromiumVersion || Number(chromiumVersion) < 105 ? "fallback" : "modern";
}

export function browserCompatibilityMode(): BrowserCompatibilityMode {
  if (typeof window === "undefined") return "modern";
  const supportsDynamicViewport = typeof CSS !== "undefined"
    && typeof CSS.supports === "function"
    && CSS.supports("height", "100dvh");
  return resolveBrowserCompatibilityMode({
    search: window.location.search,
    userAgent: window.navigator.userAgent,
    supportsDynamicViewport,
  });
}

export function initializeBrowserCompatibility(): BrowserCompatibilityMode {
  const mode = browserCompatibilityMode();
  document.documentElement.dataset.compatMode = mode;
  return mode;
}

export function createCompatibleUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readCompatibleFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("This file could not be read."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}
