import { resolve } from "node:path";

export type AuthMode = "proxy" | "dev";

export interface ServerConfig {
  host: string;
  port: number;
  authMode: AuthMode;
  credentialsKey?: string;
  credentialsFile: string;
  allowedWebDavHosts: string[];
  isProduction: boolean;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = environment.NODE_ENV === "production";
  const authMode = (environment.AUTH_MODE ?? (isProduction ? "proxy" : "dev")) as AuthMode;

  if (authMode !== "proxy" && authMode !== "dev") {
    throw new Error("AUTH_MODE must be either proxy or dev.");
  }
  if (isProduction && authMode !== "proxy") {
    throw new Error("AUTH_MODE=dev is forbidden in production.");
  }

  const port = Number(environment.PORT ?? "3338");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const allowedWebDavHosts = (environment.WEBDAV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (isProduction && allowedWebDavHosts.length === 0) {
    throw new Error("WEBDAV_ALLOWED_HOSTS is required in production.");
  }

  return {
    host: environment.HOST ?? "127.0.0.1",
    port,
    authMode,
    credentialsKey: environment.CREDENTIALS_KEY,
    credentialsFile: resolve(environment.CREDENTIALS_FILE ?? "data/credentials.json"),
    allowedWebDavHosts,
    isProduction,
  };
}
