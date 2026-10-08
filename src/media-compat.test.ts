import { describe, expect, it, vi } from "vitest";
import { requestPlayback, updateMediaSessionMetadata } from "./media-compat";

describe("legacy media compatibility", () => {
  it("accepts the void play result returned by older media elements", async () => {
    await expect(requestPlayback({ play: () => undefined })).resolves.toBeUndefined();
  });

  it("preserves modern play promise rejection", async () => {
    const error = new Error("blocked");
    await expect(requestPlayback({ play: () => Promise.reject(error) })).rejects.toBe(error);
  });

  it("turns synchronous legacy play failures into a rejected promise", async () => {
    const error = new Error("unsupported");
    await expect(requestPlayback({ play: () => { throw error; } })).rejects.toBe(error);
  });

  it("treats Media Session metadata as an optional enhancement", () => {
    const session = { metadata: null } as Pick<MediaSession, "metadata">;
    const Metadata = vi.fn(function Metadata(this: MediaMetadata) {}) as unknown as new () => MediaMetadata;

    expect(updateMediaSessionMetadata({ title: "Track" }, false, { mediaSession: session, Metadata })).toBe(false);
    expect(updateMediaSessionMetadata({ title: "Track" }, true, { mediaSession: null, Metadata: null })).toBe(false);
    expect(updateMediaSessionMetadata({ title: "Track" }, true, { mediaSession: session, Metadata })).toBe(true);
    expect(Metadata).toHaveBeenCalledOnce();
  });
});
