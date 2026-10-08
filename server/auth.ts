import type { NextFunction, Request, Response } from "express";
import type { AuthMode } from "./config.js";
import type { AuthenticatedIdentity, AuthenticatedRequest } from "./types.js";

function headerValue(request: Request, name: string): string | undefined {
  const value = request.get(name)?.trim();
  return value ? value : undefined;
}

export function identityFromTrustedHeaders(request: Request): AuthenticatedIdentity | null {
  const userId = headerValue(request, "X-Auth-User-Id");
  const username = headerValue(request, "X-Auth-User");
  if (!userId || !username) return null;

  return {
    userId,
    username,
    roles: (request.get("X-Auth-Roles") ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean),
  };
}

export function requireAuthentication(mode: AuthMode) {
  return (request: Request, response: Response, next: NextFunction) => {
    const identity =
      mode === "dev"
        ? { userId: "local-development", username: "Local Listener", roles: ["developer"] }
        : identityFromTrustedHeaders(request);

    if (!identity) {
      response.setHeader("Cache-Control", "no-store");
      if (request.path.startsWith("/api/")) {
        response.status(401).json({ error: "Authentication required." });
      } else {
        response.status(401).type("text/plain").send("Authentication required.");
      }
      return;
    }

    (request as AuthenticatedRequest).identity = identity;
    next();
  };
}
