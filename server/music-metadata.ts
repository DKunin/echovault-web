const musicBrainzEndpoint = "https://musicbrainz.org/ws/2/recording/";
const coverArtEndpoint = "https://coverartarchive.org/release-group/";
const userAgent = "EchoVault/1.0 (https://music.kunini.ru)";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audioExtensionPattern = /\.(?:aac|aif|aiff|alac|caf|flac|m4a|mp3|ogg|opus|wav)$/i;
const maximumArtworkBytes = 5 * 1_024 * 1_024;
const maximumProviderResponseBytes = 5 * 1_024 * 1_024;
const maximumMetadataEntries = 10_000;
const maximumPendingLookups = 100;

export type TrackMetadataSource = "filename" | "musicbrainz";

export interface ResolvedTrackMetadata {
  path: string;
  title: string;
  artist: string;
  album: string;
  source: TrackMetadataSource;
  releaseGroupId: string | null;
}

export interface ArtworkPayload {
  bytes: Buffer;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
}

export interface TrackMetadataProvider {
  lookup(path: string): Promise<ResolvedTrackMetadata>;
  artwork(releaseGroupId: string): Promise<ArtworkPayload | null>;
}

export class MetadataInputError extends Error {}
export class MetadataProviderError extends Error {}

interface MusicBrainzArtistCredit {
  name?: string;
  joinphrase?: string;
}

interface MusicBrainzReleaseGroup {
  id?: string;
  title?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
}

interface MusicBrainzRelease {
  id?: string;
  title?: string;
  status?: string;
  date?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
  "release-group"?: MusicBrainzReleaseGroup;
}

interface MusicBrainzRecording {
  id?: string;
  title?: string;
  score?: number;
  "artist-credit"?: MusicBrainzArtistCredit[];
  releases?: MusicBrainzRelease[];
}

interface MusicBrainzSearchResponse {
  recordings?: MusicBrainzRecording[];
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface MetadataProviderOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  minimumIntervalMs?: number;
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readLimitedBody(response: globalThis.Response, maximumBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > 0 && declaredLength > maximumBytes) {
    throw new MetadataProviderError("Metadata provider response is too large.");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new MetadataProviderError("Metadata provider response is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function cleanTitle(value: string): string {
  return value
    .replace(/[＂"]/g, "")
    .replace(/\s*[[(][^\])]*(?:official|music\s+video|video|audio|lyrics?|visuali[sz]er|hd|hq|4k)[^\])]*[\])]/giu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAlbum(value: string): string {
  return value
    .replace(/\s*[[(](?:19|20)\d{2}[\])]/g, "")
    .replace(/\s*[[(]\d{2,4}\s*kbps[^\])]*[\])]/giu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutTrackNumber(value: string): string {
  return value.replace(/^\s*(?:\d{1,3}[.\s_-]+)+/, "").trim();
}

export function metadataFromPath(path: string): ResolvedTrackMetadata {
  if (!path || path.length > 4_096 || path.includes("\0") || path.endsWith("/")) {
    throw new MetadataInputError("Enter a valid audio track path.");
  }

  const parts = path.split("/").filter(Boolean).map(safelyDecode);
  const filename = parts.at(-1) ?? path;
  if (!audioExtensionPattern.test(filename)) {
    throw new MetadataInputError("Metadata is only available for supported audio files.");
  }

  const stem = filename.replace(/\.[^.]+$/, "");
  const segments = stem.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  let artist = "Unknown Artist";
  let title = withoutTrackNumber(stem);

  if (/^YTM-[\w-]+$/i.test(segments[0] ?? "") && segments.length >= 4) {
    artist = segments[2];
    title = segments.slice(3).join(" - ");
  } else if (segments.length >= 2) {
    artist = withoutTrackNumber(segments[0]);
    title = segments.slice(1).join(" - ");
  }

  const album = cleanAlbum(parts.at(-2) ?? "WebDAV") || "WebDAV";
  return {
    path,
    title: cleanTitle(title) || withoutTrackNumber(stem),
    artist: artist.trim() || "Unknown Artist",
    album,
    source: "filename",
    releaseGroupId: null,
  };
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\b(?:feat|featuring|ft)\b.*$/u, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function comparable(left: string, right: string): boolean {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || (normalizedLeft.length >= 5 && normalizedRight.includes(normalizedLeft))
    || (normalizedRight.length >= 5 && normalizedLeft.includes(normalizedRight));
}

function artistCredit(credits: MusicBrainzArtistCredit[] | undefined): string {
  return (credits ?? []).map((credit) => `${credit.name ?? ""}${credit.joinphrase ?? ""}`).join("").trim();
}

function lucenePhrase(value: string): string {
  const escaped = value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
  return `"${escaped}"`;
}

function releaseScore(release: MusicBrainzRelease): number {
  const group = release["release-group"];
  const secondaryTypes = group?.["secondary-types"] ?? [];
  const creditedArtist = artistCredit(release["artist-credit"]);
  let score = 0;
  if (release.status === "Official") score += 30;
  if (group?.["primary-type"] === "Album") score += 25;
  if (secondaryTypes.length === 0) score += 25;
  if (!secondaryTypes.includes("Compilation")) score += 15;
  if (creditedArtist && normalized(creditedArtist) !== "various artists") score += 10;
  return score;
}

function releaseYear(release: MusicBrainzRelease): number {
  const year = Number.parseInt(release.date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : 9_999;
}

function bestRelease(recording: MusicBrainzRecording): MusicBrainzRelease | null {
  return [...(recording.releases ?? [])]
    .filter((release) => uuidPattern.test(release["release-group"]?.id ?? ""))
    .sort((left, right) => releaseScore(right) - releaseScore(left) || releaseYear(left) - releaseYear(right))[0] ?? null;
}

function bestRecording(recordings: MusicBrainzRecording[], fallback: ResolvedTrackMetadata): MusicBrainzRecording | null {
  const candidates = recordings
    .map((recording) => {
      const title = recording.title ?? "";
      const artist = artistCredit(recording["artist-credit"]);
      const titleMatches = comparable(title, fallback.title);
      const artistMatches = comparable(artist, fallback.artist);
      const apiScore = Number(recording.score ?? 0);
      const release = bestRelease(recording);
      const confidence = apiScore
        + (titleMatches ? 30 : 0)
        + (artistMatches ? 25 : 0)
        + (release ? releaseScore(release) : 0);
      return { recording, titleMatches, artistMatches, apiScore, confidence };
    })
    .filter((candidate) => candidate.apiScore >= 80 && candidate.titleMatches && candidate.artistMatches)
    .sort((left, right) => right.confidence - left.confidence);
  return candidates[0]?.recording ?? null;
}

export class MusicBrainzMetadataProvider implements TrackMetadataProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly minimumIntervalMs: number;
  private readonly cache = new Map<string, CacheEntry<ResolvedTrackMetadata>>();
  private readonly pending = new Map<string, Promise<ResolvedTrackMetadata>>();
  private readonly artworkCache = new Map<string, CacheEntry<ArtworkPayload | null>>();
  private readonly knownReleaseGroups = new Set<string>();
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: MetadataProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.minimumIntervalMs = options.minimumIntervalMs ?? 1_100;
  }

  async lookup(path: string): Promise<ResolvedTrackMetadata> {
    const fallback = metadataFromPath(path);
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const existing = this.pending.get(path);
    if (existing) return existing;
    if (this.pending.size >= maximumPendingLookups) {
      throw new MetadataProviderError("The metadata lookup queue is busy. Try again shortly.");
    }

    const lookup = this.resolve(fallback)
      .then((result) => {
        const ttl = result.source === "musicbrainz" ? 30 * 24 * 60 * 60_000 : 24 * 60 * 60_000;
        this.rememberMetadata(path, result, ttl);
        return result;
      })
      .catch((error) => {
        console.warn(`MusicBrainz metadata lookup failed: ${error instanceof Error ? error.message : "unknown error"}`);
        this.rememberMetadata(path, fallback, 5 * 60_000);
        return fallback;
      })
      .finally(() => this.pending.delete(path));
    this.pending.set(path, lookup);
    return lookup;
  }

  async artwork(releaseGroupId: string): Promise<ArtworkPayload | null> {
    if (!uuidPattern.test(releaseGroupId)) throw new MetadataInputError("Invalid cover art identifier.");
    if (!this.knownReleaseGroups.has(releaseGroupId)) {
      throw new MetadataInputError("Unknown cover art identifier.");
    }
    const cached = this.artworkCache.get(releaseGroupId);
    if (cached && cached.expiresAt > this.now()) return cached.value;

    let response: globalThis.Response;
    try {
      response = await this.fetchImpl(`${coverArtEndpoint}${releaseGroupId}/front-500`, {
        headers: { "User-Agent": userAgent, Accept: "image/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MetadataProviderError(`Cover Art Archive request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    if (response.status === 404) {
      this.rememberArtwork(releaseGroupId, null, 24 * 60 * 60_000);
      return null;
    }
    if (!response.ok) throw new MetadataProviderError(`Cover Art Archive returned HTTP ${response.status}.`);

    const finalHost = response.url ? new URL(response.url).hostname.toLowerCase() : "coverartarchive.org";
    if (finalHost !== "coverartarchive.org" && finalHost !== "archive.org" && !finalHost.endsWith(".archive.org")) {
      throw new MetadataProviderError("Cover Art Archive redirected to an unexpected host.");
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      throw new MetadataProviderError("Cover Art Archive returned an invalid image.");
    }
    const bytes = await readLimitedBody(response, maximumArtworkBytes);
    const artwork = {
      bytes,
      contentType,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
    this.rememberArtwork(releaseGroupId, artwork, 7 * 24 * 60 * 60_000);
    return artwork;
  }

  private async resolve(fallback: ResolvedTrackMetadata): Promise<ResolvedTrackMetadata> {
    if (fallback.artist === "Unknown Artist") return fallback;
    const query = `recording:${lucenePhrase(fallback.title)} AND artist:${lucenePhrase(fallback.artist)}`;
    const url = new URL(musicBrainzEndpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "25");

    const payload = await this.scheduledRequest(async () => {
      const response = await this.fetchImpl(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new MetadataProviderError(`MusicBrainz returned HTTP ${response.status}.`);
      const body = await readLimitedBody(response, maximumProviderResponseBytes);
      try {
        return JSON.parse(body.toString("utf8")) as MusicBrainzSearchResponse;
      } catch {
        throw new MetadataProviderError("MusicBrainz returned invalid JSON.");
      }
    });

    const recording = bestRecording(Array.isArray(payload.recordings) ? payload.recordings : [], fallback);
    if (!recording?.title) return fallback;
    const release = bestRelease(recording);
    const group = release?.["release-group"];
    if (group?.id) this.rememberReleaseGroup(group.id);
    return {
      path: fallback.path,
      title: recording.title,
      artist: artistCredit(recording["artist-credit"]) || fallback.artist,
      album: group?.title || release?.title || fallback.album,
      source: "musicbrainz",
      releaseGroupId: group?.id ?? null,
    };
  }

  private async scheduledRequest<T>(task: () => Promise<T>): Promise<T> {
    const run = this.requestQueue.then(async () => {
      const wait = Math.max(0, this.lastRequestAt + this.minimumIntervalMs - this.now());
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
      return task();
    });
    this.requestQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private rememberArtwork(releaseGroupId: string, value: ArtworkPayload | null, ttl: number): void {
    if (!this.artworkCache.has(releaseGroupId) && this.artworkCache.size >= 32) {
      const oldestKey = this.artworkCache.keys().next().value as string | undefined;
      if (oldestKey) this.artworkCache.delete(oldestKey);
    }
    this.artworkCache.set(releaseGroupId, { expiresAt: this.now() + ttl, value });
  }

  private rememberMetadata(path: string, value: ResolvedTrackMetadata, ttl: number): void {
    if (!this.cache.has(path) && this.cache.size >= maximumMetadataEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    if (value.releaseGroupId) this.rememberReleaseGroup(value.releaseGroupId);
    this.cache.set(path, { expiresAt: this.now() + ttl, value });
  }

  private rememberReleaseGroup(releaseGroupId: string): void {
    if (!this.knownReleaseGroups.has(releaseGroupId) && this.knownReleaseGroups.size >= maximumMetadataEntries) {
      const oldestId = this.knownReleaseGroups.values().next().value as string | undefined;
      if (oldestId) this.knownReleaseGroups.delete(oldestId);
    }
    this.knownReleaseGroups.add(releaseGroupId);
  }
}
