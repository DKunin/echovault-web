import { describe, expect, it } from "vitest";
import { availableLibraryMode, collectFolderTracks } from "./music-library";
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
  it("switches to a non-empty library view when a folder only contains one item type", () => {
    expect(availableLibraryMode("folders", [item("Albums/Track.mp3", false)])).toBe("tracks");
    expect(availableLibraryMode("tracks", [item("Albums/Live/", true)])).toBe("folders");
    expect(availableLibraryMode("folders", [item("Albums/Live/", true), item("Albums/Track.mp3", false)])).toBe("folders");
    expect(availableLibraryMode("favourites", [item("Albums/Track.mp3", false)])).toBe("favourites");
  });

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
