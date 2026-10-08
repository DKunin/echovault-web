interface PlayableMedia {
  play: () => PromiseLike<void> | void;
}

type MediaSessionTarget = Pick<MediaSession, "metadata">;
type MediaMetadataConstructor = new (init?: MediaMetadataInit) => MediaMetadata;

interface MediaSessionDependencies {
  mediaSession: MediaSessionTarget | null;
  Metadata: MediaMetadataConstructor | null;
}

function detectedMediaSession(): MediaSessionTarget | null {
  try {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return null;
    return navigator.mediaSession;
  } catch {
    return null;
  }
}

function detectedMediaMetadataConstructor(): MediaMetadataConstructor | null {
  return typeof MediaMetadata === "function" ? MediaMetadata : null;
}

export function requestPlayback(media: PlayableMedia): Promise<void> {
  try {
    const result = media.play();
    return result && typeof result.then === "function" ? Promise.resolve(result) : Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

export function updateMediaSessionMetadata(
  init: MediaMetadataInit,
  enabled: boolean,
  dependencies?: MediaSessionDependencies,
): boolean {
  if (!enabled) return false;
  const mediaSession = dependencies ? dependencies.mediaSession : detectedMediaSession();
  const Metadata = dependencies ? dependencies.Metadata : detectedMediaMetadataConstructor();
  if (!mediaSession || !Metadata) return false;
  try {
    mediaSession.metadata = new Metadata(init);
    return true;
  } catch {
    return false;
  }
}
