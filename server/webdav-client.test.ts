import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebDavClient } from "./webdav-client.js";

const multistatus = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/music/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/music/Album/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/music/Artist%20-%20Track.mp3</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>10</d:getcontentlength><d:getcontenttype>audio/mpeg</d:getcontenttype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/music/notes.txt</d:href><d:propstat><d:prop><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;

describe("WebDAV client", () => {
  let server: ReturnType<typeof createServer>;
  let endpoint: string;

  beforeEach(async () => {
    server = createServer((request, response) => {
      const expected = `Basic ${Buffer.from("echo:secret").toString("base64")}`;
      if (request.headers.authorization !== expected) {
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="EchoVault"' });
        response.end();
        return;
      }
      if (request.method === "GET") {
        response.writeHead(request.headers.range ? 206 : 200, {
          "Content-Type": "audio/mpeg",
          "Accept-Ranges": "bytes",
          ...(request.headers.range ? { "Content-Range": "bytes 0-3/10" } : {}),
        });
        response.end("tone");
        return;
      }
      response.writeHead(207, { "Content-Type": "application/xml" });
      response.end(multistatus);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${address.port}/music/`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("authenticates, filters directory entries, and preserves relative routes", async () => {
    const client = new WebDavClient({ endpoint, username: "echo", password: "secret", allowsInsecureHttp: true });
    const items = await client.listDirectory("");

    expect(items.map(({ name, path, isDirectory }) => ({ name, path, isDirectory }))).toEqual([
      { name: "Album", path: "Album/", isDirectory: true },
      { name: "Artist - Track.mp3", path: "Artist%20-%20Track.mp3", isDirectory: false },
    ]);
  });

  it("forwards byte ranges for browser seeking", async () => {
    const client = new WebDavClient({ endpoint, username: "echo", password: "secret", allowsInsecureHttp: true });
    const response = await client.stream("Artist%20-%20Track.mp3", "bytes=0-3");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(await response.text()).toBe("tone");
  });
});
