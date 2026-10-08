import { listWebDavItems } from "./api";
import type { Track, WebDavItem } from "./types";

export function trackFromItem(item: WebDavItem): Track {
  const withoutExtension = item.name.replace(/\.[^.]+$/, "");
  const split = withoutExtension.split(/\s+-\s+/, 2);
  const pathParts = item.path.split("/").filter(Boolean);
  const parent = pathParts[pathParts.length - 2];
  return {
    id: item.path,
    title: split.length === 2 ? split[1] : withoutExtension,
    artist: split.length === 2 ? split[0] : "Unknown Artist",
    album: parent ? decodeURIComponent(parent) : "WebDAV",
    path: item.path,
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
