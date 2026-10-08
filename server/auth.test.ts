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
      endpoint: "https://dav.example.test/music/",
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
      endpoint: "https://dav.example.test/music/",
      username: "echo",
      hasPassword: true,
      allowsInsecureHttp: false,
    });
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
