import { describe, expect, it, vi } from "vitest";
import { MusicBrainzMetadataProvider, metadataFromPath } from "./music-metadata.js";

describe("MusicBrainz metadata provider", () => {
  it("extracts useful fallback metadata from YouTube Music filenames", () => {
    expect(metadataFromPath(
      "80s%20Rock/YTM-3wxyN3z9PL4%20-%20RHINO%20-%20Starship%20-%20Nothing's%20Gonna%20Stop%20Us%20Now%20(Official%20Music%20Video)%20%5BHD%5D.mp3",
    )).toMatchObject({
      title: "Nothing's Gonna Stop Us Now",
      artist: "Starship",
      album: "80s Rock",
      source: "filename",
    });
  });

  it("uses a high-confidence MusicBrainz match and prefers an original album over a compilation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      recordings: [{
        id: "recording-id",
        title: "Nothing’s Gonna Stop Us Now",
        score: 100,
        "artist-credit": [{ name: "Starship" }],
        releases: [
          {
            title: "A Decade in Rock",
            status: "Official",
            date: "1999",
            "artist-credit": [{ name: "Various Artists" }],
            "release-group": {
              id: "11111111-1111-4111-8111-111111111111",
              title: "A Decade in Rock",
              "primary-type": "Album",
              "secondary-types": ["Compilation"],
            },
          },
          {
            title: "No Protection",
            status: "Official",
            date: "1987",
            "artist-credit": [{ name: "Starship" }],
            "release-group": {
              id: "22222222-2222-4222-8222-222222222222",
              title: "No Protection",
              "primary-type": "Album",
              "secondary-types": [],
            },
          },
        ],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new MusicBrainzMetadataProvider({ fetch: fetchMock, minimumIntervalMs: 0 });

    const result = await provider.lookup("80s%20Rock/Starship%20-%20Nothing's%20Gonna%20Stop%20Us%20Now.mp3");

    expect(result).toEqual({
      path: "80s%20Rock/Starship%20-%20Nothing's%20Gonna%20Stop%20Us%20Now.mp3",
      title: "Nothing’s Gonna Stop Us Now",
      artist: "Starship",
      album: "No Protection",
      source: "musicbrainz",
      releaseGroupId: "22222222-2222-4222-8222-222222222222",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin).toBe("https://musicbrainz.org");
    expect(requestUrl.searchParams.get("query")).toContain("recording:");
  });

  it("keeps cleaned filename metadata when MusicBrainz has no confident match", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      recordings: [{
        title: "A Different Song",
        score: 100,
        "artist-credit": [{ name: "Another Artist" }],
      }],
    }), { status: 200 }));
    const provider = new MusicBrainzMetadataProvider({ fetch: fetchMock, minimumIntervalMs: 0 });

    const result = await provider.lookup("Music/Actual Artist - Actual Song.mp3");

    expect(result).toMatchObject({
      title: "Actual Song",
      artist: "Actual Artist",
      album: "Music",
      source: "filename",
      releaseGroupId: null,
    });
  });

  it("deduplicates concurrent lookups for the same track", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ recordings: [] }), { status: 200 })
    ));
    const provider = new MusicBrainzMetadataProvider({ fetch: fetchMock, minimumIntervalMs: 0 });

    await Promise.all([
      provider.lookup("Music/Artist - Song.mp3"),
      provider.lookup("Music/Artist - Song.mp3"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("spaces MusicBrainz requests to respect the public API rate limit", async () => {
    let currentTime = 10_000;
    const waits: number[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ recordings: [] }), { status: 200 })
    ));
    const provider = new MusicBrainzMetadataProvider({
      fetch: fetchMock,
      now: () => currentTime,
      minimumIntervalMs: 1_100,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        currentTime += milliseconds;
      },
    });

    await provider.lookup("Music/Artist - First Song.mp3");
    await provider.lookup("Music/Artist - Second Song.mp3");

    expect(waits).toEqual([1_100]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries temporary MusicBrainz throttling with bounded backoff", async () => {
    const waits: number[] = [];
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recordings: [] }), { status: 200 }));
    const provider = new MusicBrainzMetadataProvider({
      fetch: fetchMock,
      minimumIntervalMs: 0,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
    });

    const result = await provider.lookup("Music/Artist - Song.mp3");

    expect(result.source).toBe("filename");
    expect(waits).toEqual([1_000]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("proxies only bounded image responses from Cover Art Archive", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        recordings: [{
          title: "Song",
          score: 100,
          "artist-credit": [{ name: "Artist" }],
          releases: [{
            title: "Album",
            status: "Official",
            "artist-credit": [{ name: "Artist" }],
            "release-group": {
              id: "22222222-2222-4222-8222-222222222222",
              title: "Album",
              "primary-type": "Album",
              "secondary-types": [],
            },
          }],
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg", "Content-Length": "3", ETag: "cover-v1" },
      }));
    const provider = new MusicBrainzMetadataProvider({ fetch: fetchMock, minimumIntervalMs: 0 });

    await expect(provider.artwork("11111111-1111-4111-8111-111111111111")).rejects.toThrow(
      "Unknown cover art identifier.",
    );
    await provider.lookup("Music/Artist - Song.mp3");
    const result = await provider.artwork("22222222-2222-4222-8222-222222222222");

    expect(result?.bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(result?.contentType).toBe("image/jpeg");
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://coverartarchive.org/release-group/22222222-2222-4222-8222-222222222222/front-500",
    );
  });
});
