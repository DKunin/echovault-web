import { describe, expect, it } from "vitest";
import {
  decodePlaylist,
  encodePlaylist,
  importedPlaylist,
  playlistFormat,
  playlistFromTracks,
  relativePathForPlaylistItem,
} from "./playlist-document";

describe("EchoVault playlist documents", () => {
  it("exports the native v1 format with a portable WebDAV track reference", () => {
    const playlist = playlistFromTracks(
      "Road Trip",
      [{ id: "Album/One.mp3", title: "One", artist: "Artist", album: "Album", path: "Album/One.mp3" }],
      "https://dav.example.com/music/",
    );
    const payload = JSON.parse(encodePlaylist(playlist)) as Record<string, unknown>;

    expect(payload.format).toBe(playlistFormat);
    expect(payload.version).toBe(1);
    expect(playlist.items[0].referenceID).toBe("webdav-track:https://dav.example.com/music/Album/One.mp3");
  });

  it("imports native folder references, deduplicates items, and preserves portable paths", () => {
    const contents = JSON.stringify({
      format: playlistFormat,
      version: 1,
      playlist: {
        id: "41008d5e-55f0-4c20-9379-51a53f58f55d",
        name: "Road Trip",
        createdAt: 812345678.5,
        updatedAt: 812345679,
        items: [
          {
            id: "04fbffbb-a035-47af-817b-a5ea01f42c29",
            kind: "folder",
            referenceID: "webdav-folder:https://dav.example.com/music/Albums/",
            title: "Albums",
            subtitle: "Albums",
          },
          {
            id: "64b67120-201b-4c55-8507-0d08dc182a7c",
            kind: "folder",
            referenceID: "webdav-folder:https://dav.example.com/music/Albums/",
            title: "Albums",
            subtitle: "Albums",
          },
        ],
      },
    });

    const decoded = decodePlaylist(contents);
    const imported = importedPlaylist(decoded, ["Road Trip"]);

    expect(imported.name).toBe("Road Trip (Imported)");
    expect(imported.items).toHaveLength(1);
    expect(relativePathForPlaylistItem(imported.items[0], "https://dav.example.com/music/")).toBe("Albums/");
  });

  it("rejects unsupported versions", () => {
    expect(() => decodePlaylist(JSON.stringify({ format: playlistFormat, version: 99, playlist: {} })))
      .toThrow("Playlist format version 99 is not supported.");
  });

  it("does not resolve references outside the configured WebDAV root or with embedded credentials", () => {
    const baseItem = {
      id: "04fbffbb-a035-47af-817b-a5ea01f42c29",
      kind: "track" as const,
      title: "One",
    };

    expect(relativePathForPlaylistItem(
      { ...baseItem, referenceID: "webdav-track:https://other.example/music/One.mp3" },
      "https://dav.example/music/",
    )).toBeNull();
    expect(relativePathForPlaylistItem(
      { ...baseItem, referenceID: "webdav-track:https://user:password@dav.example/music/One.mp3" },
      "https://dav.example/music/",
    )).toBeNull();
  });
});
