import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";
import { MemoryCredentialStore } from "./credential-store.js";
import type { TrackMetadataProvider } from "./music-metadata.js";

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 3338,
  authMode: "proxy",
  credentialsFile: "unused",
  webDavEndpoint: "https://webdav.kunini.ru/music/",
  allowedWebDavHosts: [],
  isProduction: false,
};

const metadata: TrackMetadataProvider = {
  async lookup(path) {
    return {
      path,
      title: "Resolved Song",
      artist: "Resolved Artist",
      album: "Resolved Album",
      source: "musicbrainz",
      releaseGroupId: "22222222-2222-4222-8222-222222222222",
    };
  },
  async artwork() {
    return {
      bytes: Buffer.from([1, 2, 3]),
      contentType: "image/jpeg",
      etag: "cover-v1",
      lastModified: null,
    };
  },
};

describe("metadata API", () => {
  it("returns browser-safe metadata with same-origin artwork", async () => {
    const app = await createApp({ config, credentials: new MemoryCredentialStore(), metadata });

    const response = await request(app)
      .get("/api/metadata/track")
      .query({ path: "Album/Artist - Song.mp3" })
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .expect(200);

    expect(response.body).toEqual({
      path: "Album/Artist - Song.mp3",
      title: "Resolved Song",
      artist: "Resolved Artist",
      album: "Resolved Album",
      source: "musicbrainz",
      artworkUrl: "/api/metadata/artwork/22222222-2222-4222-8222-222222222222",
    });
  });

  it("serves cached artwork without exposing the upstream URL", async () => {
    const app = await createApp({ config, credentials: new MemoryCredentialStore(), metadata });

    const response = await request(app)
      .get("/api/metadata/artwork/22222222-2222-4222-8222-222222222222")
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(response.headers["cache-control"]).toBe("private, max-age=604800, immutable");
    expect(response.body).toEqual(Buffer.from([1, 2, 3]));
  });
});
