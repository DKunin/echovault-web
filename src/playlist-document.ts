import { collectFolderTracks } from "./music-library";
import { createCompatibleUuid } from "./browser-compat";
import type { Track } from "./types";

export const playlistFormat = "com.dkunin.echovault.playlist";
export const playlistVersion = 1;
export const maximumPlaylistFileSize = 5 * 1_024 * 1_024;
export const maximumPlaylistItemCount = 10_000;

export type PlaylistItemKind = "track" | "folder";

export interface PlaylistItem {
  id: string;
  kind: PlaylistItemKind;
  referenceID: string;
  title: string;
  subtitle?: string | null;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistFilePayload {
  format: string;
  version: number;
  playlist: MusicPlaylist;
}

const swiftReferenceDateSeconds = 978_307_200;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nativeDateNow(): number {
  return Date.now() / 1_000 - swiftReferenceDateSeconds;
}

function endpointRoot(endpoint: string): URL {
  const root = new URL(endpoint);
  if (!root.pathname.endsWith("/")) root.pathname += "/";
  return root;
}

function absoluteWebDavUrl(path: string, endpoint: string): string {
  return new URL(path.replace(/^\/+/, ""), endpointRoot(endpoint)).href;
}

function portableReference(kind: PlaylistItemKind, path: string, endpoint: string): string {
  return `webdav-${kind}:${absoluteWebDavUrl(path, endpoint)}`;
}

function referenceUrl(referenceID: string, kind: PlaylistItemKind): URL | null {
  const prefix = `webdav-${kind}:`;
  const candidate = referenceID.startsWith(prefix) ? referenceID.slice(prefix.length) : referenceID;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

export function relativePathForPlaylistItem(
  item: PlaylistItem,
  endpoint: string,
): string | null {
  const root = endpointRoot(endpoint);
  const candidate = referenceUrl(item.referenceID, item.kind);
  if (!candidate || candidate.origin !== root.origin) return null;
  if (candidate.username || candidate.password) return null;
  if (!candidate.pathname.startsWith(root.pathname)) return null;
  return candidate.pathname.slice(root.pathname.length);
}

export function playlistFromTracks(name: string, tracks: Track[], endpoint: string): MusicPlaylist {
  const timestamp = nativeDateNow();
  return {
    id: createCompatibleUuid(),
    name,
    items: tracks.map((track) => ({
      id: createCompatibleUuid(),
      kind: "track",
      referenceID: portableReference("track", track.path, endpoint),
      title: track.title,
      subtitle: track.artist,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function encodePlaylist(playlist: MusicPlaylist): string {
  validatePlaylist(playlist);
  const contents = JSON.stringify({ format: playlistFormat, playlist, version: playlistVersion }, null, 2);
  if (new TextEncoder().encode(contents).byteLength > maximumPlaylistFileSize) {
    throw new Error("This playlist file is too large to export.");
  }
  return contents;
}

export function decodePlaylist(contents: string): MusicPlaylist {
  if (!contents.trim()) throw new Error("This is not a valid EchoVault playlist file.");
  if (new TextEncoder().encode(contents).byteLength > maximumPlaylistFileSize) {
    throw new Error("This playlist file is too large to import.");
  }

  let payload: PlaylistFilePayload;
  try {
    payload = JSON.parse(contents) as PlaylistFilePayload;
  } catch {
    throw new Error("This is not a valid EchoVault playlist file.");
  }
  if (payload?.format !== playlistFormat || !payload.playlist) {
    throw new Error("This is not a valid EchoVault playlist file.");
  }
  if (payload.version !== playlistVersion) {
    throw new Error(`Playlist format version ${String(payload.version)} is not supported.`);
  }
  validatePlaylist(payload.playlist);
  return payload.playlist;
}

export function importedPlaylist(source: MusicPlaylist, existingNames: string[]): MusicPlaylist {
  const timestamp = nativeDateNow();
  const references = new Set<string>();
  const items: PlaylistItem[] = [];
  for (const item of source.items) {
    const key = `${item.kind}\u0000${item.referenceID}`;
    if (references.has(key)) continue;
    references.add(key);
    items.push({ ...item, id: createCompatibleUuid() });
  }

  return {
    id: createCompatibleUuid(),
    name: availableImportedName(source.name, existingNames),
    items,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function defaultPlaylistFilename(name: string): string {
  const filename = name.replace(/[/:\\?%*|"<>]/g, "-").trim().slice(0, 120);
  return `${filename || "Playlist"}.echovaultplaylist`;
}

export async function resolvePlaylistTracks(
  playlist: MusicPlaylist,
  endpoint: string,
): Promise<Track[]> {
  const result: Track[] = [];
  const seenPaths = new Set<string>();

  for (const item of playlist.items) {
    const path = relativePathForPlaylistItem(item, endpoint);
    if (path === null) continue;
    const pathParts = path.split("/").filter(Boolean);
    const candidates = item.kind === "folder"
      ? await collectFolderTracks(path)
      : [{
          id: path,
          title: item.title,
          artist: item.subtitle || "Unknown Artist",
          album: decodeURIComponent(pathParts[pathParts.length - 2] ?? "WebDAV"),
          path,
        }];
    for (const track of candidates) {
      if (seenPaths.has(track.path)) continue;
      seenPaths.add(track.path);
      result.push(track);
    }
  }
  return result;
}

function availableImportedName(name: string, existingNames: string[]): string {
  const normalizedName = (value: string) => value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
  const used = new Set(existingNames.map(normalizedName));
  if (!used.has(normalizedName(name))) return name;
  let copyNumber = 1;
  while (true) {
    const suffix = copyNumber === 1 ? "Imported" : `Imported ${copyNumber}`;
    const candidate = `${name} (${suffix})`;
    if (!used.has(normalizedName(candidate))) return candidate;
    copyNumber += 1;
  }
}

function validatePlaylist(playlist: MusicPlaylist): void {
  if (
    !playlist ||
    typeof playlist.name !== "string" ||
    !playlist.name.trim() ||
    playlist.name.length > 255 ||
    !uuidPattern.test(playlist.id) ||
    !Number.isFinite(playlist.createdAt) ||
    !Number.isFinite(playlist.updatedAt) ||
    !Array.isArray(playlist.items) ||
    playlist.items.length > maximumPlaylistItemCount
  ) {
    throw new Error("This playlist contains invalid or excessive data.");
  }

  for (const item of playlist.items) {
    if (
      !item ||
      !uuidPattern.test(item.id) ||
      (item.kind !== "track" && item.kind !== "folder") ||
      typeof item.referenceID !== "string" ||
      !item.referenceID ||
      item.referenceID.length > 4_096 ||
      typeof item.title !== "string" ||
      !item.title ||
      item.title.length > 1_024 ||
      (item.subtitle !== undefined && item.subtitle !== null && (typeof item.subtitle !== "string" || item.subtitle.length > 1_024))
    ) {
      throw new Error("This playlist contains invalid or excessive data.");
    }
  }
}
