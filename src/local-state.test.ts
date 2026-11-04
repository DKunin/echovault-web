import { describe, expect, it } from "vitest";
import {
  defaultPlayerSnapshot,
  defaultUiState,
  loadPlayerSnapshot,
  loadUiState,
  savePlayerProgress,
  savePlayerSnapshot,
  saveUiState,
} from "./local-state";
import type { Track } from "./types";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const tracks: Track[] = [
  {
    id: "80s/one.mp3",
    path: "80s/one.mp3",
    title: "One",
    artist: "Artist",
    album: "Album",
    artworkUrl: "/api/metadata/artwork/11111111-1111-4111-8111-111111111111",
    metadataSource: "musicbrainz",
    metadataResolved: true,
  },
  {
    id: "80s/two.mp3",
    path: "80s/two.mp3",
    title: "Two",
    artist: "Artist",
    album: "Album",
  },
];

describe("local player state", () => {
  it("restores the user-scoped screen, folder, mode, and selected playlist", () => {
    const storage = new MemoryStorage();
    const state = {
      section: "playlists" as const,
      libraryPath: "80s%20Rock/",
      libraryMode: "tracks" as const,
      selectedPlaylistId: "road-trip",
    };

    saveUiState("user-a", state, storage);

    expect(loadUiState("user-a", storage)).toEqual(state);
    expect(loadUiState("user-b", storage)).toEqual(defaultUiState);
  });

  it("restores queue order, current track, progress, and playback preferences", () => {
    const storage = new MemoryStorage();
    const state = {
      queue: tracks,
      currentTrackId: tracks[1].id,
      currentTime: 42.5,
      volume: 0.4,
      shuffle: true,
      repeat: "all" as const,
      favouriteIds: [tracks[1].id],
    };

    savePlayerSnapshot("user-a", state, storage);
    savePlayerProgress("user-a", tracks[1].id, 51.25, storage);

    expect(loadPlayerSnapshot("user-a", storage)).toEqual({
      ...state,
      currentTime: 51.25,
      queue: [
        tracks[0],
        { ...tracks[1], artworkUrl: null, metadataSource: "filename", metadataResolved: false },
      ],
    });
    expect(loadPlayerSnapshot("user-b", storage)).toEqual(defaultPlayerSnapshot);
  });

  it("fails closed to defaults for malformed or unknown schemas", () => {
    const storage = new MemoryStorage();
    storage.setItem("echo-vault-ui:v1:user-a", "not-json");
    storage.setItem("echo-vault-player:v1:user-a", JSON.stringify({ version: 99, queue: tracks }));

    expect(loadUiState("user-a", storage)).toEqual(defaultUiState);
    expect(loadPlayerSnapshot("user-a", storage)).toEqual(defaultPlayerSnapshot);
  });
});
