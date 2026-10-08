import { describe, expect, it, vi } from "vitest";
import { createCompatibleUuid, resolveBrowserCompatibilityMode } from "./browser-compat";

describe("browser compatibility mode", () => {
  it("keeps capable browsers on the modern path", () => {
    expect(resolveBrowserCompatibilityMode({
      search: "",
      userAgent: "Mozilla/5.0 Chrome/132.0 Safari/537.36",
      supportsDynamicViewport: true,
    })).toBe("modern");
  });

  it("uses fallback mode for older webOS Chromium engines", () => {
    expect(resolveBrowserCompatibilityMode({
      search: "",
      userAgent: "Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/68.0 Safari/537.36 WebAppManager",
      supportsDynamicViewport: false,
    })).toBe("fallback");
  });

  it("allows either mode to be forced from the URL", () => {
    const signals = {
      userAgent: "Mozilla/5.0 Chrome/132.0 Safari/537.36",
      supportsDynamicViewport: true,
    };
    expect(resolveBrowserCompatibilityMode({ ...signals, search: "?compat=fallback" })).toBe("fallback");
    expect(resolveBrowserCompatibilityMode({ ...signals, search: "?compat=modern" })).toBe("modern");
  });

  it("creates RFC 4122 version 4 IDs when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });
    try {
      expect(createCompatibleUuid()).toBe("abababab-abab-4bab-abab-abababababab");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
