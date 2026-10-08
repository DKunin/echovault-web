import { createHash, randomBytes } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { WebDavCredentials, WebDavItem } from "./types.js";
import {
  assertPermittedWebDavUrl,
  relativeWebDavPath,
  resolveWebDavPath,
} from "./webdav-config.js";

const supportedAudioExtensions = new Set([
  "aac",
  "aif",
  "aiff",
  "alac",
  "caf",
  "flac",
  "m4a",
  "m4b",
  "mp3",
  "mp4",
  "wav",
]);

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

export class WebDavRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function parseDigestChallenge(header: string): DigestChallenge | null {
  const digestIndex = header.toLowerCase().indexOf("digest ");
  if (digestIndex === -1) return null;

  const value = header.slice(digestIndex + 7);
  const parts: Record<string, string> = {};
  const pattern = /([a-zA-Z0-9_-]+)=(?:"((?:\\.|[^"])*)"|([^,\s]+))/g;
  for (const match of value.matchAll(pattern)) {
    parts[match[1].toLowerCase()] = (match[2] ?? match[3]).replace(/\\"/g, '"');
  }
  if (!parts.realm || !parts.nonce) return null;
  return {
    realm: parts.realm,
    nonce: parts.nonce,
    qop: parts.qop,
    opaque: parts.opaque,
    algorithm: parts.algorithm,
  };
}

function digestAuthorization(
  challenge: DigestChallenge,
  credentials: WebDavCredentials,
  method: string,
  url: URL,
): string {
  const algorithm = (challenge.algorithm ?? "MD5").toUpperCase();
  const isSession = algorithm.endsWith("-SESS");
  const baseAlgorithm = algorithm.replace(/-SESS$/, "");
  const hashAlgorithm = baseAlgorithm === "SHA-256" ? "sha256" : baseAlgorithm === "MD5" ? "md5" : null;
  if (!hashAlgorithm) throw new Error(`Unsupported WebDAV digest algorithm: ${algorithm}`);

  const hash = (value: string) => createHash(hashAlgorithm).update(value).digest("hex");
  const uri = `${url.pathname}${url.search}`;
  const cnonce = randomBytes(12).toString("hex");
  const nonceCount = "00000001";
  const supportedQops = (challenge.qop ?? "")
    .split(",")
    .map((qop) => qop.trim().toLowerCase());
  const qop = supportedQops.includes("auth") ? "auth" : undefined;
  if (challenge.qop && !qop) throw new Error("The WebDAV server requires an unsupported digest qop.");

  let ha1 = hash(`${credentials.username}:${challenge.realm}:${credentials.password}`);
  if (isSession) ha1 = hash(`${ha1}:${challenge.nonce}:${cnonce}`);
  const ha2 = hash(`${method}:${uri}`);
  const response = qop
    ? hash(`${ha1}:${challenge.nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`)
    : hash(`${ha1}:${challenge.nonce}:${ha2}`);

  const values = [
    `username="${credentials.username.replace(/(["\\])/g, "\\$1")}"`,
    `realm="${challenge.realm.replace(/(["\\])/g, "\\$1")}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
  ];
  if (challenge.opaque) values.push(`opaque="${challenge.opaque}"`);
  if (qop) values.push(`qop=${qop}`, `nc=${nonceCount}`, `cnonce="${cnonce}"`);
  return `Digest ${values.join(", ")}`;
}

function propValue<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isAudioFile(url: URL): boolean {
  const extension = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  return supportedAudioExtensions.has(extension);
}

export class WebDavClient {
  private readonly baseUrl: URL;

  constructor(private readonly credentials: WebDavCredentials) {
    this.baseUrl = new URL(credentials.endpoint);
  }

  async checkConnection(): Promise<void> {
    const response = await this.request(this.baseUrl, {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
      body: WebDavClient.propertyRequestBody,
    });
    await this.assertSuccess(response, new Set([200, 207]));
  }

  async listDirectory(path: string): Promise<WebDavItem[]> {
    const directoryUrl = resolveWebDavPath(this.credentials.endpoint, path);
    const response = await this.request(directoryUrl, {
      method: "PROPFIND",
      headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body: WebDavClient.propertyRequestBody,
    });
    await this.assertSuccess(response, new Set([200, 207]));
    const document = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      trimValues: true,
    }).parse(await response.text()) as {
      multistatus?: { response?: unknown | unknown[] };
    };

    const directoryPath = directoryUrl.pathname.replace(/\/$/, "");
    const items: WebDavItem[] = [];

    for (const rawResponse of asArray(document.multistatus?.response) as Array<Record<string, unknown>>) {
      const href = String(propValue(rawResponse.href as string | string[] | undefined) ?? "");
      if (!href) continue;

      let itemUrl: URL;
      try {
        itemUrl = new URL(href, directoryUrl);
        assertPermittedWebDavUrl(this.baseUrl, itemUrl);
      } catch {
        continue;
      }

      const propstat = asArray(rawResponse.propstat as unknown | unknown[]) as Array<Record<string, unknown>>;
      const successful = propstat.find((entry) => String(entry.status ?? "").includes(" 200 ")) ?? propstat[0];
      const properties = (successful?.prop ?? {}) as Record<string, unknown>;
      const resourceType = (properties.resourcetype ?? {}) as Record<string, unknown>;
      const isDirectory = Object.hasOwn(resourceType, "collection");
      if (isDirectory && !itemUrl.pathname.endsWith("/")) itemUrl.pathname += "/";
      if (itemUrl.pathname.replace(/\/$/, "") === directoryPath) continue;

      const encodedName = itemUrl.pathname.replace(/\/$/, "").split("/").pop() ?? "";
      let name: string;
      try {
        name = decodeURIComponent(encodedName);
      } catch {
        name = encodedName;
      }
      if (!name || name.startsWith(".") || (!isDirectory && !isAudioFile(itemUrl))) continue;

      const contentLength = Number(properties.getcontentlength);
      items.push({
        name,
        path: relativeWebDavPath(this.baseUrl, itemUrl),
        isDirectory,
        contentLength: Number.isFinite(contentLength) ? contentLength : null,
        contentType: properties.getcontenttype ? String(properties.getcontenttype) : null,
        lastModified: properties.getlastmodified ? String(properties.getlastmodified) : null,
        eTag: properties.getetag ? String(properties.getetag) : null,
      });
    }

    return items.sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  async stream(path: string, range?: string): Promise<Response> {
    const url = resolveWebDavPath(this.credentials.endpoint, path);
    if (!isAudioFile(url)) throw new WebDavRequestError("Only supported audio files can be streamed.", 415);
    const headers: Record<string, string> = {};
    if (range) headers.Range = range;
    const response = await this.request(url, { method: "GET", headers });
    await this.assertSuccess(response, new Set([...Array.from({ length: 100 }, (_, index) => index + 200), 206]));
    return response;
  }

  private async request(url: URL, init: RequestInit): Promise<Response> {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      assertPermittedWebDavUrl(this.baseUrl, currentUrl);
      const method = init.method ?? "GET";
      let response = await fetch(currentUrl, { ...init, redirect: "manual" });

      if (response.status === 401 && (this.credentials.username || this.credentials.password)) {
        const challengeHeader = response.headers.get("www-authenticate") ?? "";
        const digestChallenge = parseDigestChallenge(challengeHeader);
        const authorization = digestChallenge
          ? digestAuthorization(digestChallenge, this.credentials, method, currentUrl)
          : challengeHeader.toLowerCase().includes("basic")
            ? `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`, "utf8").toString("base64")}`
            : null;
        if (authorization) {
          const headers = new Headers(init.headers);
          headers.set("Authorization", authorization);
          response = await fetch(currentUrl, { ...init, headers, redirect: "manual" });
        }
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return response;
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      return response;
    }
    throw new WebDavRequestError("The WebDAV server redirected too many times.", 502);
  }

  private async assertSuccess(response: Response, accepted: Set<number>): Promise<void> {
    if (accepted.has(response.status)) return;
    if (response.status === 401) throw new WebDavRequestError("The WebDAV server rejected these credentials.", 401);
    if (response.status === 403) throw new WebDavRequestError("The WebDAV account cannot access this folder.", 403);
    if (response.status === 404) throw new WebDavRequestError("The WebDAV folder or file was not found.", 404);
    throw new WebDavRequestError(`The WebDAV server returned HTTP ${response.status}.`, response.status);
  }

  private static readonly propertyRequestBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
    <d:getcontentlength />
    <d:getcontenttype />
    <d:getlastmodified />
    <d:getetag />
  </d:prop>
</d:propfind>`;
}
