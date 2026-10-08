import type { WebDavCredentials } from "./types.js";

export class WebDavConfigurationError extends Error {}

export function normalizeWebDavCredentials(
  input: WebDavCredentials,
  allowedHosts: string[],
): WebDavCredentials {
  const endpoint = input.endpoint.trim();
  if (!endpoint) throw new WebDavConfigurationError("Enter a WebDAV server address.");

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new WebDavConfigurationError("Enter a valid WebDAV server address.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WebDavConfigurationError("The WebDAV address must use HTTP or HTTPS.");
  }
  if (url.protocol === "http:" && !input.allowsInsecureHttp) {
    throw new WebDavConfigurationError("Enable insecure HTTP access to use an unencrypted server.");
  }
  if (url.username || url.password) {
    throw new WebDavConfigurationError("Enter credentials in their own fields, not in the server address.");
  }
  if (url.search || url.hash) {
    throw new WebDavConfigurationError("The WebDAV address cannot include a query or fragment.");
  }
  if (input.username.includes(":")) {
    throw new WebDavConfigurationError("The username cannot contain a colon.");
  }
  if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new WebDavConfigurationError("This WebDAV host is not allowed by the server configuration.");
  }

  if (!url.pathname.endsWith("/")) url.pathname += "/";

  return {
    endpoint: url.toString(),
    username: input.username,
    password: input.password,
    allowsInsecureHttp: input.allowsInsecureHttp,
  };
}

export function resolveWebDavPath(endpoint: string, path: string): URL {
  const base = new URL(endpoint);
  const candidate = path.replace(/^\/+/, "");

  for (const segment of candidate.split("/")) {
    if (!segment) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new WebDavConfigurationError("The WebDAV path is malformed.");
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new WebDavConfigurationError("The WebDAV path is outside the configured folder.");
    }
  }

  const resolved = new URL(candidate, base);
  assertPermittedWebDavUrl(base, resolved);
  return resolved;
}

export function assertPermittedWebDavUrl(base: URL, candidate: URL): void {
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const sameOrigin = base.protocol === candidate.protocol && base.host === candidate.host;
  const samePath = candidate.pathname === base.pathname.replace(/\/$/, "") || candidate.pathname.startsWith(basePath);
  if (!sameOrigin || !samePath || candidate.username || candidate.password) {
    throw new WebDavConfigurationError("The WebDAV server redirected outside the configured folder.");
  }
}

export function relativeWebDavPath(base: URL, candidate: URL): string {
  assertPermittedWebDavUrl(base, candidate);
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  return candidate.pathname.slice(basePath.length);
}
