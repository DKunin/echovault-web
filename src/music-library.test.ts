import { describe, expect, it } from "vitest";
import { collectFolderTracks } from "./music-library";
import type { WebDavItem } from "./types";

function item(path: string, isDirectory: boolean): WebDavItem {
  return {
    name: path.replace(/\/$/, "").split("/").at(-1) ?? path,
    path,
    isDirectory,
    contentLength: null,
    contentType: null,
    lastModified: null,
    eTag: null,
  };
}

describe("remote music library", () => {
  it("collects a folder recursively while preserving WebDAV order and removing duplicates", async () => {
    const listings: Record<string, WebDavItem[]> = {
      "Albums/": [item("Albums/One.mp3", false), item("Albums/Live/", true)],
      "Albums/Live/": [item("Albums/One.mp3", false), item("Albums/Live/Two.m4a", false)],
    };

    const tracks = await collectFolderTracks("Albums/", async (path) => ({
      path,
      items: listings[path] ?? [],
    }));

    expect(tracks.map((track) => track.path)).toEqual(["Albums/One.mp3", "Albums/Live/Two.m4a"]);
  });
});
