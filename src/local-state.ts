import type { LibraryMode } from "./music-library";
import type { AppSection, Track } from "./types";

export type RepeatMode = "off" | "all" | "one";

export interface UiState {
  section: AppSection;
  libraryPath: string;
  libraryMode: LibraryMode;
  selectedPlaylistId: string | null;
}

export interface PlayerSnapshot {
  queue: Track[];
  currentTrackId: string | null;
  currentTime: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  favouriteIds: string[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const schemaVersion = 1;
const maximumQueueLength = 10_000;
const maximumFavouriteCount = 10_000;
const maximumPathLength = 4_096;
const maximumLabelLength = 1_024;
const maximumTrackTime = 7 * 24 * 60 * 60;
const sections = new Set<AppSection>(["library", "now-playing", "playlists", "settings"]);
const libraryModes = new Set<LibraryMode>(["folders", "tracks", "favourites"]);
const repeatModes = new Set<RepeatMode>(["off", "all", "one"]);

export const defaultUiState: UiState = {
  section: "library",
  libraryPath: "",
  libraryMode: "folders",
  selectedPlaylistId: null,
};

export const defaultPlayerSnapshot: PlayerSnapshot = {
  queue: [],
  currentTrackId: null,
  currentTime: 0,
  volume: 0.72,
  shuffle: false,
  repeat: "off",
  favouriteIds: [],
};

function storageKey(kind: "ui" | "player" | "player-progress", userId: string): string {
  return `echo-vault-${kind}:v${schemaVersion}:${encodeURIComponent(userId)}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, maximumLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength ? value : null;
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function storedTrack(value: unknown): Track | null {
  const candidate = record(value);
  if (!candidate) return null;
  const id = boundedString(candidate.id, maximumPathLength);
  const path = boundedString(candidate.path, maximumPathLength);
  const title = boundedString(candidate.title, maximumLabelLength);
  const artist = boundedString(candidate.artist, maximumLabelLength);
  const album = boundedString(candidate.album, maximumLabelLength);
  if (!id || !path || !title || !artist || !album) return null;

  const artworkUrl = typeof candidate.artworkUrl === "string"
    && candidate.artworkUrl.startsWith("/api/metadata/artwork/")
    && candidate.artworkUrl.length <= maximumPathLength
    ? candidate.artworkUrl
    : null;
  const metadataSource = candidate.metadataSource === "musicbrainz" ? "musicbrainz" : "filename";
  return {
    id,
    path,
    title,
    artist,
    album,
    artworkUrl,
    metadataSource,
    metadataResolved: candidate.metadataResolved === true,
  };
}

function parsedValue(key: string, storage: StorageLike): Record<string, unknown> | null {
  try {
    const value = storage.getItem(key);
    const parsed = value ? record(JSON.parse(value) as unknown) : null;
    return parsed?.version === schemaVersion ? parsed : null;
  } catch {
    return null;
  }
}

export function loadUiState(userId: string, storage: StorageLike = window.localStorage): UiState {
  const parsed = parsedValue(storageKey("ui", userId), storage);
  if (!parsed) return { ...defaultUiState };
  const libraryPath = typeof parsed.libraryPath === "string" && parsed.libraryPath.length <= maximumPathLength
    ? parsed.libraryPath
    : "";
  return {
    section: sections.has(parsed.section as AppSection) ? parsed.section as AppSection : "library",
    libraryPath,
    libraryMode: libraryModes.has(parsed.libraryMode as LibraryMode) ? parsed.libraryMode as LibraryMode : "folders",
    selectedPlaylistId: boundedString(parsed.selectedPlaylistId, maximumLabelLength),
  };
}

export function saveUiState(
  userId: string,
  state: UiState,
  storage: StorageLike = window.localStorage,
): void {
  try {
    storage.setItem(storageKey("ui", userId), JSON.stringify({ version: schemaVersion, ...state }));
  } catch {
    // The current session remains usable when browser storage is unavailable or full.
  }
}

export function loadPlayerSnapshot(
  userId: string,
  storage: StorageLike = window.localStorage,
): PlayerSnapshot {
  const parsed = parsedValue(storageKey("player", userId), storage);
  if (!parsed) return { ...defaultPlayerSnapshot, queue: [], favouriteIds: [] };
  const queue = Array.isArray(parsed.queue)
    ? parsed.queue.slice(0, maximumQueueLength).map(storedTrack).filter((track): track is Track => track !== null)
    : [];
  const requestedTrackId = boundedString(parsed.currentTrackId, maximumPathLength);
  const currentTrackId = requestedTrackId && queue.some((track) => track.id === requestedTrackId)
    ? requestedTrackId
    : null;
  const progress = parsedValue(storageKey("player-progress", userId), storage);
  const progressTime = progress?.currentTrackId === currentTrackId
    ? progress.currentTime
    : parsed.currentTime;
  const favouriteIds = Array.isArray(parsed.favouriteIds)
    ? [...new Set(parsed.favouriteIds
      .slice(0, maximumFavouriteCount)
      .map((value) => boundedString(value, maximumPathLength))
      .filter((value): value is string => value !== null))]
    : [];
  return {
    queue,
    currentTrackId,
    currentTime: currentTrackId ? finiteNumber(progressTime, 0, 0, maximumTrackTime) : 0,
    volume: finiteNumber(parsed.volume, defaultPlayerSnapshot.volume, 0, 1),
    shuffle: parsed.shuffle === true,
    repeat: repeatModes.has(parsed.repeat as RepeatMode) ? parsed.repeat as RepeatMode : "off",
    favouriteIds,
  };
}

export function savePlayerSnapshot(
  userId: string,
  state: PlayerSnapshot,
  storage: StorageLike = window.localStorage,
): void {
  try {
    storage.setItem(storageKey("player", userId), JSON.stringify({ version: schemaVersion, ...state }));
  } catch {
    // Playback continues when browser storage is unavailable or full.
  }
}

export function savePlayerProgress(
  userId: string,
  currentTrackId: string | null,
  currentTime: number,
  storage: StorageLike = window.localStorage,
): void {
  try {
    storage.setItem(storageKey("player-progress", userId), JSON.stringify({
      version: schemaVersion,
      currentTrackId,
      currentTime: finiteNumber(currentTime, 0, 0, maximumTrackTime),
    }));
  } catch {
    // Playback continues when browser storage is unavailable or full.
  }
}
