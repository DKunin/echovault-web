import { describe, expect, it } from "vitest";
import { kuniniWebDavEndpoint, loadConfig } from "./config.js";

describe("server configuration", () => {
  it("pins WebDAV to the Kunini HTTPS endpoint", () => {
    const config = loadConfig({ NODE_ENV: "production", AUTH_MODE: "proxy" });

    expect(config.webDavEndpoint).toBe(kuniniWebDavEndpoint);
    expect(config.webDavEndpoint).toBe("https://webdav.kunini.ru/music/");
    expect(config.allowedWebDavHosts).toContain("webdav.kunini.ru");
  });

  it("keeps the pinned host allowed alongside additional configured hosts", () => {
    const config = loadConfig({ WEBDAV_ALLOWED_HOSTS: "archive.example.test" });

    expect(config.allowedWebDavHosts).toEqual(["archive.example.test", "webdav.kunini.ru"]);
  });
});
