import { describe, expect, it } from "vitest";
import {
  normalizeWebDavCredentials,
  relativeWebDavPath,
  resolveWebDavPath,
} from "./webdav-config.js";

describe("WebDAV configuration", () => {
  it("normalizes the root and keeps credentials out of the URL", () => {
    expect(
      normalizeWebDavCredentials(
        {
          endpoint: "https://dav.example.test/music",
          username: "echo",
          password: "secret",
          allowsInsecureHttp: false,
        },
        ["dav.example.test"],
      ),
    ).toEqual({
      endpoint: "https://dav.example.test/music/",
      username: "echo",
      password: "secret",
      allowsInsecureHttp: false,
    });
  });

  it("rejects unexpected hosts, embedded credentials, and insecure transport", () => {
    const base = { username: "echo", password: "secret", allowsInsecureHttp: false };
    expect(() => normalizeWebDavCredentials({ ...base, endpoint: "https://other.test/music" }, ["dav.example.test"])).toThrow("not allowed");
    expect(() => normalizeWebDavCredentials({ ...base, endpoint: "https://echo:secret@dav.example.test/music" }, [])).toThrow("own fields");
    expect(() => normalizeWebDavCredentials({ ...base, endpoint: "http://dav.example.test/music" }, [])).toThrow("insecure HTTP");
  });

  it("confines every routed path to the configured WebDAV root", () => {
    expect(resolveWebDavPath("https://dav.example.test/music/", "Album/Track.mp3").href).toBe(
      "https://dav.example.test/music/Album/Track.mp3",
    );
    expect(() => resolveWebDavPath("https://dav.example.test/music/", "../private/file.mp3")).toThrow("outside");
    expect(() => resolveWebDavPath("https://dav.example.test/music/", "%2e%2e/private/file.mp3")).toThrow("outside");
    expect(
      relativeWebDavPath(
        new URL("https://dav.example.test/music/"),
        new URL("https://dav.example.test/music/Album/Track.mp3"),
      ),
    ).toBe("Album/Track.mp3");
  });
});
