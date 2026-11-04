const musicBrainzEndpoint = "https://musicbrainz.org/ws/2/recording/";
const musicBrainzReleaseGroupEndpoint = "https://musicbrainz.org/ws/2/release-group/";
const coverArtEndpoint = "https://coverartarchive.org/release-group/";
const userAgent = "EchoVault/1.0 (https://music.kunini.ru)";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audioExtensionPattern = /\.(?:aac|aif|aiff|alac|caf|flac|m4a|mp3|ogg|opus|wav)$/i;
const maximumArtworkBytes = 5 * 1_024 * 1_024;
const maximumProviderResponseBytes = 5 * 1_024 * 1_024;
const maximumMetadataEntries = 10_000;
const maximumPendingLookups = 100;
const maximumProviderAttempts = 3;
const maximumSearchPages = 4;
const temporaryProviderStatuses = new Set([429, 500, 502, 503, 504]);

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
  score?: number;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "artist-credit"?: MusicBrainzArtistCredit[];
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
  disambiguation?: string;
  "first-release-date"?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
  releases?: MusicBrainzRelease[];
}

interface MusicBrainzSearchResponse {
  count?: number;
  recordings?: MusicBrainzRecording[];
}

interface MusicBrainzReleaseGroupSearchResponse {
  "release-groups"?: MusicBrainzReleaseGroup[];
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
    .replace(/⧸/g, "/")
    .replace(/[＂"]/g, "")
    .replace(/\s*[[(][^\])]*(?:official|music\s+video|video|audio|lyrics?|visuali[sz]er|hd|hq|4k)[^\])]*[\])]/giu, "")
    .replace(/\s*\[cc\]\s*/giu, " ")
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.+$/iu, "")
    .replace(/\s+-\s+the\s+.+\s+show\s*\((?:19|20)\d{2}\)\s*$/iu, "")
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

function withoutArtistPrefix(value: string, artist: string): string {
  const normalizedArtist = normalized(artist);
  const separator = value.search(/[:：]/u);
  if (separator < 0 || normalized(value.slice(0, separator)) !== normalizedArtist) return value;
  return value.slice(separator + 1).trim();
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
  } else if (/^YTM-[\w-]+$/i.test(segments[0] ?? "") && segments.length >= 3) {
    artist = segments[1];
    title = withoutArtistPrefix(segments.slice(2).join(" - "), artist);
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
  return score - releaseVariantPenalty(release);
}

function releaseVariantPenalty(release: MusicBrainzRelease): number {
  const group = release["release-group"];
  const description = `${release.title ?? ""} ${group?.title ?? ""}`;
  const normalizedDescription = normalized(description);
  const hasDatedVenueTitle = /(?:^|\D)(?:19|20)\d{2}[-./]\d{2}[-./]\d{2}(?:\D|$)/u.test(description);
  const hasVariantLabel = /\b(?:bootleg|demo|live|remix(?:ed)?)\b/u.test(normalizedDescription);
  return hasDatedVenueTitle || hasVariantLabel ? 100 : 0;
}

function releaseYear(release: MusicBrainzRelease): number {
  const year = Number.parseInt(release.date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : 9_999;
}

function recordingYear(recording: MusicBrainzRecording): number {
  const year = Number.parseInt(recording["first-release-date"]?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : 9_999;
}

function recordingVariantPenalty(recording: MusicBrainzRecording): number {
  const description = normalized(`${recording.title ?? ""} ${recording.disambiguation ?? ""}`);
  return /\b(?:acoustic|demo|edit(?:ed)?|instrumental|karaoke|live|remix(?:ed)?|version)\b/u.test(description)
      || /\bre\s+record(?:ed|ing)?\b/u.test(description)
    ? 100
    : 0;
}

function retryDelay(response: globalThis.Response, attempt: number, now: number): number {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(10_000, Math.max(1_000, seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(10_000, Math.max(1_000, date - now));
  }
  return Math.min(10_000, 2_000 * (attempt + 1));
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
        + (release ? releaseScore(release) : 0)
        + (normalized(title) === normalized(fallback.title) ? 20 : 0)
        - recordingVariantPenalty(recording);
      return { recording, titleMatches, artistMatches, apiScore, confidence, year: recordingYear(recording) };
    })
    .filter((candidate) => candidate.apiScore >= 80 && candidate.titleMatches && candidate.artistMatches)
    .sort((left, right) => right.confidence - left.confidence || left.year - right.year);
  return candidates[0]?.recording ?? null;
}

function isPreferredRecording(recording: MusicBrainzRecording): boolean {
  const release = bestRelease(recording);
  const group = release?.["release-group"];
  const secondaryTypes = group?.["secondary-types"] ?? [];
  return release?.status === "Official"
    && ["Album", "EP", "Single"].includes(group?.["primary-type"] ?? "")
    && secondaryTypes.length === 0
    && releaseVariantPenalty(release) === 0
    && recordingVariantPenalty(recording) === 0;
}

function bestMatchingTitleAlbum(
  groups: MusicBrainzReleaseGroup[],
  fallback: ResolvedTrackMetadata,
): MusicBrainzReleaseGroup | null {
  return groups
    .filter((group) => uuidPattern.test(group.id ?? "")
      && Number(group.score ?? 0) >= 90
      && group["primary-type"] === "Album"
      && (group["secondary-types"] ?? []).length === 0
      && comparable(group.title ?? "", fallback.title)
      && comparable(artistCredit(group["artist-credit"]), fallback.artist))
    .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0)
      || String(left["first-release-date"] ?? "9999").localeCompare(String(right["first-release-date"] ?? "9999")))[0] ?? null;
}

export class MusicBrainzMetadataProvider implements TrackMetadataProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly minimumIntervalMs: number;
  private readonly cache = new Map<string, CacheEntry<ResolvedTrackMetadata>>();
  private readonly pending = new Map<string, Promise<ResolvedTrackMetadata>>();
  private readonly artworkCache = new Map<string, CacheEntry<ArtworkPayload | null>>();
  private readonly pendingArtwork = new Map<string, Promise<ArtworkPayload | null>>();
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
    const existing = this.pendingArtwork.get(releaseGroupId);
    if (existing) return existing;

    const request = this.fetchArtwork(releaseGroupId)
      .finally(() => this.pendingArtwork.delete(releaseGroupId));
    this.pendingArtwork.set(releaseGroupId, request);
    return request;
  }

  private async fetchArtwork(releaseGroupId: string): Promise<ArtworkPayload | null> {
    for (let attempt = 0; attempt < maximumProviderAttempts; attempt += 1) {
      let response: globalThis.Response;
      try {
        response = await this.fetchImpl(`${coverArtEndpoint}${releaseGroupId}/front-500`, {
          headers: { "User-Agent": userAgent, Accept: "image/*" },
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        if (attempt < maximumProviderAttempts - 1) {
          await this.sleep(1_000 * (attempt + 1));
          continue;
        }
        throw new MetadataProviderError(`Cover Art Archive request failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      if (response.status === 404) {
        this.rememberArtwork(releaseGroupId, null, 24 * 60 * 60_000);
        return null;
      }
      if (temporaryProviderStatuses.has(response.status) && attempt < maximumProviderAttempts - 1) {
        await this.sleep(retryDelay(response, attempt, this.now()));
        continue;
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
    throw new MetadataProviderError("Cover Art Archive is temporarily unavailable.");
  }

  private async resolve(fallback: ResolvedTrackMetadata): Promise<ResolvedTrackMetadata> {
    if (fallback.artist === "Unknown Artist") return fallback;
    const query = `recording:${lucenePhrase(fallback.title)} AND artist:${lucenePhrase(fallback.artist)} AND status:official`;
    const url = new URL(musicBrainzEndpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "100");

    const recordings: MusicBrainzRecording[] = [];
    let recording: MusicBrainzRecording | null = null;
    for (let page = 0; page < maximumSearchPages; page += 1) {
      const offset = page * 100;
      if (offset > 0) url.searchParams.set("offset", String(offset));
      const payload = await this.requestMusicBrainz(url);
      const pageRecordings = Array.isArray(payload.recordings) ? payload.recordings : [];
      recordings.push(...pageRecordings);
      recording = bestRecording(recordings, fallback);
      if (!recording || isPreferredRecording(recording)) break;
      if (page === 0) {
        const titleAlbum = await this.findMatchingTitleAlbum(fallback);
        if (titleAlbum?.id && titleAlbum.title) {
          return {
            path: fallback.path,
            title: recording.title ?? fallback.title,
            artist: artistCredit(recording["artist-credit"]) || fallback.artist,
            album: titleAlbum.title,
            source: "musicbrainz",
            releaseGroupId: titleAlbum.id,
          };
        }
      }
      if (!Number.isFinite(payload.count) || Number(payload.count) <= offset + pageRecordings.length) break;
    }

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

  private async findMatchingTitleAlbum(fallback: ResolvedTrackMetadata): Promise<MusicBrainzReleaseGroup | null> {
    const query = `releasegroup:${lucenePhrase(fallback.title)} AND artist:${lucenePhrase(fallback.artist)} AND primarytype:album`;
    const url = new URL(musicBrainzReleaseGroupEndpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "10");
    const payload = await this.requestMusicBrainz<MusicBrainzReleaseGroupSearchResponse>(url);
    return bestMatchingTitleAlbum(Array.isArray(payload["release-groups"]) ? payload["release-groups"] : [], fallback);
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

  private async requestMusicBrainz<T = MusicBrainzSearchResponse>(url: URL): Promise<T> {
    for (let attempt = 0; attempt < maximumProviderAttempts; attempt += 1) {
      const response = await this.scheduledRequest(() => this.fetchImpl(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      }));
      if (temporaryProviderStatuses.has(response.status) && attempt < maximumProviderAttempts - 1) {
        await this.sleep(retryDelay(response, attempt, this.now()));
        continue;
      }
      if (!response.ok) throw new MetadataProviderError(`MusicBrainz returned HTTP ${response.status}.`);
      const body = await readLimitedBody(response, maximumProviderResponseBytes);
      try {
        return JSON.parse(body.toString("utf8")) as T;
      } catch {
        throw new MetadataProviderError("MusicBrainz returned invalid JSON.");
      }
    }
    throw new MetadataProviderError("MusicBrainz is temporarily unavailable.");
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
