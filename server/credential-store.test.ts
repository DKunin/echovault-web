import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EncryptedFileCredentialStore } from "./credential-store.js";

describe("encrypted credential store", () => {
  it("round-trips credentials without writing plaintext secrets", async () => {
    const file = join(process.cwd(), "data", `credentials-test-${process.pid}-${Date.now()}.json`);
    const store = new EncryptedFileCredentialStore(file, randomBytes(32).toString("base64"));
    const credentials = {
      endpoint: "https://dav.example.test/music/",
      username: "echo-user",
      password: "very-secret-password",
      allowsInsecureHttp: false,
    };

    try {
      await store.put("user-1", credentials);
      expect(await store.get("user-1")).toEqual(credentials);
      const serialized = await readFile(file, "utf8");
      expect(serialized).not.toContain(credentials.password);
      expect(serialized).not.toContain(credentials.username);
    } finally {
      await rm(file, { force: true });
    }
  });
});
