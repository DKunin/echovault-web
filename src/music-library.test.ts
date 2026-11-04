import { describe, expect, it } from "vitest";
import { availableLibraryMode, collectFolderTracks, trackFromItem } from "./music-library";
import type { TrackMetadata, WebDavItem } from "./types";

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

  it("cleans YouTube Music filenames before remote metadata arrives", () => {
    const track = trackFromItem(item(
      "80s Rock/YTM-3wxyN3z9PL4 - RHINO - Starship - Nothing's Gonna Stop Us Now (Official Music Video) [HD].mp3",
      false,
    ));

    expect(track).toMatchObject({
      title: "Nothing's Gonna Stop Us Now",
      artist: "Starship",
      album: "80s Rock",
      metadataSource: "filename",
      metadataResolved: false,
    });
  });

  it("applies resolved metadata and artwork without changing the stable track identity", () => {
    const source = item("Albums/Artist - Raw Name.mp3", false);
    const metadata: TrackMetadata = {
      path: source.path,
      title: "Canonical Name",
      artist: "Canonical Artist",
      album: "Canonical Album",
      artworkUrl: "/api/metadata/artwork/cover-id",
      source: "musicbrainz",
    };

    expect(trackFromItem(source, metadata)).toEqual({
      id: source.path,
      path: source.path,
      title: "Canonical Name",
      artist: "Canonical Artist",
      album: "Canonical Album",
      artworkUrl: "/api/metadata/artwork/cover-id",
      metadataSource: "musicbrainz",
      metadataResolved: true,
    });
  });
});
