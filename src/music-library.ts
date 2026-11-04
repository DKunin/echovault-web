import { listWebDavItems } from "./api";
import type { Track, TrackMetadata, WebDavItem } from "./types";

export type LibraryMode = "folders" | "tracks" | "favourites";

export function availableLibraryMode(current: LibraryMode, items: WebDavItem[]): LibraryMode {
  if (current === "favourites") return current;

  const hasFolders = items.some((item) => item.isDirectory);
  const hasTracks = items.some((item) => !item.isDirectory);
  if (current === "folders" && !hasFolders && hasTracks) return "tracks";
  if (current === "tracks" && !hasTracks && hasFolders) return "folders";
  return current;
}

function filenameMetadata(item: WebDavItem): Pick<Track, "title" | "artist" | "album"> {
  const withoutExtension = item.name.replace(/\.[^.]+$/, "");
  const segments = withoutExtension.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const pathParts = item.path.split("/").filter(Boolean);
  const parent = pathParts[pathParts.length - 2];
  const isYouTubeMusicName = /^YTM-[\w-]+$/i.test(segments[0] ?? "") && segments.length >= 4;
  const title = isYouTubeMusicName
    ? segments.slice(3).join(" - ")
    : segments.length >= 2
      ? segments.slice(1).join(" - ")
      : withoutExtension;
  const artist = isYouTubeMusicName ? segments[2] : segments.length >= 2 ? segments[0] : "Unknown Artist";
  return {
    title: title
      .replace(/[＂"]/g, "")
      .replace(/\s*[[(][^\])]*(?:official|music\s+video|video|audio|lyrics?|visuali[sz]er|hd|hq|4k)[^\])]*[\])]/giu, "")
      .replace(/\s+/g, " ")
      .trim(),
    artist,
    album: parent ? decodeURIComponent(parent) : "WebDAV",
  };
}

export function trackFromItem(item: WebDavItem, metadata?: TrackMetadata): Track {
  const fallback = filenameMetadata(item);
  return {
    id: item.path,
    title: metadata?.title ?? fallback.title,
    artist: metadata?.artist ?? fallback.artist,
    album: metadata?.album ?? fallback.album,
    path: item.path,
    artworkUrl: metadata?.artworkUrl ?? null,
    metadataSource: metadata?.source ?? "filename",
    metadataResolved: Boolean(metadata),
  };
}

type ItemLoader = (path: string) => Promise<{ path: string; items: WebDavItem[] }>;

export async function collectFolderTracks(
  rootPath: string,
  loadItems: ItemLoader = listWebDavItems,
): Promise<Track[]> {
  const pending = [rootPath];
  const visitedDirectories = new Set<string>();
  const seenTracks = new Set<string>();
  const tracks: Track[] = [];

  while (pending.length > 0) {
    const path = pending.shift();
    if (path === undefined || visitedDirectories.has(path)) continue;
    if (visitedDirectories.size >= 10_000) {
      throw new Error("This folder contains too many subfolders to play safely.");
    }
    visitedDirectories.add(path);

    const payload = await loadItems(path);
    for (const item of payload.items) {
      if (item.isDirectory) {
        pending.push(item.path);
      } else if (!seenTracks.has(item.path)) {
        seenTracks.add(item.path);
        tracks.push(trackFromItem(item));
      }
    }
  }

  return tracks;
}

export function shuffledTracks(tracks: Track[]): Track[] {
  const result = [...tracks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
