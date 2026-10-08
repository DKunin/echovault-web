import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import type { WebDavCredentials } from "./types.js";

interface StoredEnvelope {
  version: 1;
  records: Record<string, { iv: string; tag: string; ciphertext: string }>;
}

export interface CredentialStore {
  get(userId: string): Promise<WebDavCredentials | null>;
  put(userId: string, credentials: WebDavCredentials): Promise<void>;
}

export class MemoryCredentialStore implements CredentialStore {
  private readonly records = new Map<string, WebDavCredentials>();

  async get(userId: string): Promise<WebDavCredentials | null> {
    return this.records.get(userId) ?? null;
  }

  async put(userId: string, credentials: WebDavCredentials): Promise<void> {
    this.records.set(userId, structuredClone(credentials));
  }
}

export class EncryptedFileCredentialStore implements CredentialStore {
  private readonly key: Buffer;

  constructor(
    private readonly filePath: string,
    base64Key: string,
  ) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) {
      throw new Error("CREDENTIALS_KEY must be a base64-encoded 32-byte key.");
    }
  }

  async get(userId: string): Promise<WebDavCredentials | null> {
    const envelope = await this.readEnvelope();
    const record = envelope.records[userId];
    if (!record) return null;

    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as WebDavCredentials;
  }

  async put(userId: string, credentials: WebDavCredentials): Promise<void> {
    const envelope = await this.readEnvelope();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), "utf8"),
      cipher.final(),
    ]);
    envelope.records[userId] = {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    await this.writeEnvelope(envelope);
  }

  private async readEnvelope(): Promise<StoredEnvelope> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as StoredEnvelope;
      if (parsed.version !== 1 || typeof parsed.records !== "object") {
        throw new Error("Unsupported credentials file format.");
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, records: {} };
      }
      throw error;
    }
  }

  private async writeEnvelope(envelope: StoredEnvelope): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, this.filePath);
  }
}
