import express from "express";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { EncryptedFileCredentialStore, MemoryCredentialStore } from "./credential-store.js";

const config = loadConfig();
const credentials = config.credentialsKey
  ? new EncryptedFileCredentialStore(config.credentialsFile, config.credentialsKey)
  : config.isProduction
    ? (() => {
        throw new Error("CREDENTIALS_KEY is required in production.");
      })()
    : new MemoryCredentialStore();

const app = await createApp({
  config,
  credentials,
  attachFrontend: async (server) => {
    if (config.isProduction) {
      server.use(express.static("dist", { index: false, fallthrough: true }));
      server.use((_request, response) => response.sendFile("index.html", { root: "dist" }));
      return;
    }

    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    server.use(vite.middlewares);
  },
});

app.listen(config.port, config.host, () => {
  console.log(`EchoVault listening on http://${config.host}:${config.port} (${config.authMode} auth)`);
});
