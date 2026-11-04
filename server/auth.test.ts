import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";
import { MemoryCredentialStore } from "./credential-store.js";

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 3338,
  authMode: "proxy",
  credentialsFile: "unused",
  webDavEndpoint: "https://webdav.kunini.ru/music/",
  allowedWebDavHosts: [],
  isProduction: false,
};

describe("Kunini authentication boundary", () => {
  it("rejects every route, including frontend paths, without trusted identity", async () => {
    const app = await createApp({ config, credentials: new MemoryCredentialStore() });

    await request(app).get("/api/session").expect(401, { error: "Authentication required." });
    await request(app).get("/favicon.png").expect(401, "Authentication required.");
    await request(app).get("/").expect(401, "Authentication required.");
  });

  it("requires both stable user ID and username", async () => {
    const app = await createApp({ config, credentials: new MemoryCredentialStore() });

    await request(app).get("/api/session").set("X-Auth-User", "listener").expect(401);
    await request(app).get("/api/session").set("X-Auth-User-Id", "user-1").expect(401);
  });

  it("exposes the identity inserted by the trusted reverse proxy", async () => {
    const app = await createApp({ config, credentials: new MemoryCredentialStore() });

    const response = await request(app)
      .get("/api/session")
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .set("X-Auth-Roles", "music,admin")
      .expect(200);

    expect(response.body).toEqual({
      user: { userId: "user-1", username: "listener", roles: ["music", "admin"] },
    });
  });

  it("offers an encrypted default WebDAV connection to authenticated users", async () => {
    const credentials = new MemoryCredentialStore();
    await credentials.put("__default__", {
      endpoint: "http://192.0.2.10:4243/music/",
      username: "echo",
      password: "secret",
      allowsInsecureHttp: false,
    });
    const app = await createApp({ config, credentials });

    const response = await request(app)
      .get("/api/settings/webdav")
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .expect(200);

    expect(response.body).toEqual({
      configured: true,
      endpoint: "https://webdav.kunini.ru/music/",
      managed: true,
      legacyEndpoints: ["http://192.0.2.10:4243/music/"],
    });
  });

  it("ignores per-user credentials and reports only the server-managed profile", async () => {
    const credentials = new MemoryCredentialStore();
    await credentials.put("user-1", {
      endpoint: "https://personal.example.test/",
      username: "personal-user",
      password: "personal-password",
      allowsInsecureHttp: false,
    });
    const app = await createApp({ config, credentials });

    const response = await request(app)
      .get("/api/settings/webdav")
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .expect(200);

    expect(response.body).toEqual({
      configured: false,
      endpoint: "https://webdav.kunini.ru/music/",
      managed: true,
      legacyEndpoints: [],
    });
  });

  it("forbids authenticated users from replacing the shared WebDAV profile", async () => {
    const credentials = new MemoryCredentialStore();
    const app = await createApp({ config, credentials });

    await request(app)
      .put("/api/settings/webdav")
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .send({ username: "attacker", password: "replacement" })
      .expect(403, { error: "The shared WebDAV profile is managed by the server operator." });

    expect(await credentials.get("__default__")).toBeNull();
  });

  it("does not let unknown API routes fall through to the frontend", async () => {
    const app = await createApp({ config, credentials: new MemoryCredentialStore() });

    await request(app)
      .post("/api/settings/webdav")
      .set("X-Auth-User", "listener")
      .set("X-Auth-User-Id", "user-1")
      .expect(404, { error: "API route not found." });
  });
});
