import { Readable } from "node:stream";
import express, { type NextFunction, type Request, type Response } from "express";
import { requireAuthentication } from "./auth.js";
import type { ServerConfig } from "./config.js";
import type { CredentialStore } from "./credential-store.js";
import type { AuthenticatedRequest, WebDavCredentials } from "./types.js";
import { WebDavConfigurationError, normalizeWebDavCredentials } from "./webdav-config.js";
import { WebDavClient, WebDavRequestError } from "./webdav-client.js";

export interface AppDependencies {
  config: ServerConfig;
  credentials: CredentialStore;
  attachFrontend?: (app: express.Express) => Promise<void>;
}

const defaultWebDavIdentity = "__default__";

function authenticated(request: Request): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}

async function credentialsForRequest(request: Request, store: CredentialStore) {
  return (
    (await store.get(authenticated(request).identity.userId)) ??
    (await store.get(defaultWebDavIdentity))
  );
}

export async function createApp(dependencies: AppDependencies): Promise<express.Express> {
  const app = express();
  app.disable("x-powered-by");

  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (dependencies.config.isProduction) {
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'",
      );
    }
    next();
  });

  // This gate intentionally runs before API routes, static assets, and Vite middleware.
  app.use(requireAuthentication(dependencies.config.authMode));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/api/session", (request, response) => {
    response.json({ user: authenticated(request).identity });
  });

  app.get("/api/settings/webdav", async (request, response, next) => {
    try {
      const settings = await credentialsForRequest(request, dependencies.credentials);
      response.json({
        configured: Boolean(settings),
        endpoint: settings?.endpoint ?? "",
        username: settings?.username ?? "",
        hasPassword: Boolean(settings?.password),
        allowsInsecureHttp: settings?.allowsInsecureHttp ?? false,
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings/webdav", async (request, response, next) => {
    try {
      const identity = authenticated(request).identity;
      const previous = await credentialsForRequest(request, dependencies.credentials);
      const input = request.body as Partial<WebDavCredentials>;
      const password = typeof input.password === "string" && input.password.length > 0
        ? input.password
        : previous?.password ?? "";
      const settings = normalizeWebDavCredentials(
        {
          endpoint: String(input.endpoint ?? ""),
          username: String(input.username ?? ""),
          password,
          allowsInsecureHttp: input.allowsInsecureHttp === true,
        },
        dependencies.config.allowedWebDavHosts,
      );
      await new WebDavClient(settings).checkConnection();
      await dependencies.credentials.put(identity.userId, settings);
      response.json({
        configured: true,
        endpoint: settings.endpoint,
        username: settings.username,
        hasPassword: Boolean(settings.password),
        allowsInsecureHttp: settings.allowsInsecureHttp,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/webdav/items", async (request, response, next) => {
    try {
      const settings = await credentialsForRequest(request, dependencies.credentials);
      if (!settings) {
        response.status(428).json({ error: "Connect a WebDAV server in Settings first." });
        return;
      }
      const path = typeof request.query.path === "string" ? request.query.path : "";
      response.json({ path, items: await new WebDavClient(settings).listDirectory(path) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/webdav/stream", async (request, response, next) => {
    try {
      const settings = await credentialsForRequest(request, dependencies.credentials);
      if (!settings) {
        response.status(428).json({ error: "Connect a WebDAV server in Settings first." });
        return;
      }
      const path = typeof request.query.path === "string" ? request.query.path : "";
      const upstream = await new WebDavClient(settings).stream(path, request.get("Range"));
      response.status(upstream.status);
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      response.setHeader("Cache-Control", "private, no-store");
      if (!upstream.body) {
        response.end();
        return;
      }
      Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(response);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found." });
  });

  if (dependencies.attachFrontend) await dependencies.attachFrontend(app);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof WebDavConfigurationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof WebDavRequestError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: errorMessage(error) });
  });

  return app;
}
