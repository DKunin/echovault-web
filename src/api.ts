import type { SessionUser, WebDavItem, WebDavSettings } from "./types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function getSession(): Promise<{ user: SessionUser }> {
  return api("/api/session");
}

export function getWebDavSettings(): Promise<WebDavSettings> {
  return api("/api/settings/webdav");
}

export function saveWebDavSettings(input: {
  endpoint: string;
  username: string;
  password: string;
  allowsInsecureHttp: boolean;
}): Promise<WebDavSettings> {
  return api("/api/settings/webdav", { method: "PUT", body: JSON.stringify(input) });
}

export function listWebDavItems(path = ""): Promise<{ path: string; items: WebDavItem[] }> {
  return api(`/api/webdav/items?path=${encodeURIComponent(path)}`);
}

export function streamUrl(path: string): string {
  return `/api/webdav/stream?path=${encodeURIComponent(path)}`;
}
