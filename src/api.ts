import type { SessionUser, TrackMetadata, WebDavItem, WebDavSettings } from "./types";

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

export function listWebDavItems(path = ""): Promise<{ path: string; items: WebDavItem[] }> {
  return api(`/api/webdav/items?path=${encodeURIComponent(path)}`);
}

export function streamUrl(path: string): string {
  return `/api/webdav/stream?path=${encodeURIComponent(path)}`;
}

const metadataRequests = new Map<string, Promise<TrackMetadata>>();
const maximumMetadataRequests = 10_000;

export function getTrackMetadata(path: string): Promise<TrackMetadata> {
  const existing = metadataRequests.get(path);
  if (existing) return existing;
  const pending = api<TrackMetadata>(`/api/metadata/track?path=${encodeURIComponent(path)}`)
    .catch((error) => {
      metadataRequests.delete(path);
      throw error;
    });
  if (metadataRequests.size >= maximumMetadataRequests) {
    const oldestPath = metadataRequests.keys().next().value as string | undefined;
    if (oldestPath) metadataRequests.delete(oldestPath);
  }
  metadataRequests.set(path, pending);
  return pending;
}
