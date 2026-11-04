import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getTrackMetadata, streamUrl } from "../api";
import { browserCompatibilityMode } from "../browser-compat";
import {
  loadPlayerSnapshot,
  type PlayerSnapshot,
  type RepeatMode,
  savePlayerProgress,
  savePlayerSnapshot,
} from "../local-state";
import { requestPlayback, updateMediaSessionMetadata } from "../media-compat";
import type { Track } from "../types";

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  favouriteIds: string[];
  error: string | null;
  play: (track: Track, queue?: Track[]) => void;
  enqueue: (track: Track) => void;
  toggleFavourite: (track: Track) => void;
  toggle: () => void;
  previous: () => void;
  next: () => void;
  seek: (time: number) => void;
  setVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children, userId }: PropsWithChildren<{ userId: string }>) {
  const [restored] = useState(() => loadPlayerSnapshot(userId));
  const audioRef = useRef<HTMLAudioElement>(null);
  const shouldAutoplay = useRef(false);
  const restoredIndex = restored.currentTrackId
    ? restored.queue.findIndex((track) => track.id === restored.currentTrackId)
    : -1;
  const restoredProgress = useRef(restored.currentTrackId && restored.currentTime > 0
    ? { trackId: restored.currentTrackId, time: restored.currentTime }
    : null);
  const [queue, setQueue] = useState<Track[]>(restored.queue);
  const [currentIndex, setCurrentIndex] = useState(restoredIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(restored.currentTime);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(restored.volume);
  const [shuffle, setShuffle] = useState(restored.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(restored.repeat);
  const [favouriteIds, setFavouriteIds] = useState<string[]>(restored.favouriteIds);
  const [error, setError] = useState<string | null>(null);
  const currentTrack = currentIndex >= 0 ? queue[currentIndex] ?? null : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = streamUrl(currentTrack.path);
    audio.load();
    const pending = restoredProgress.current;
    setCurrentTime(pending?.trackId === currentTrack.id ? pending.time : 0);
    setDuration(0);
    setError(null);
    if (shouldAutoplay.current) {
      void requestPlayback(audio).catch(() => setError("Playback could not start. Try pressing Play."));
    }
  }, [currentTrack?.path]);

  useEffect(() => {
    if (!currentTrack) return;
    updateMediaSessionMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.artworkUrl
        ? [{ src: currentTrack.artworkUrl, sizes: "500x500" }]
        : [{ src: "/app-logo.png", sizes: "1200x1200", type: "image/png" }],
    }, browserCompatibilityMode() === "modern");
  }, [currentTrack?.title, currentTrack?.artist, currentTrack?.album, currentTrack?.artworkUrl]);

  useEffect(() => {
    if (!currentTrack || currentTrack.metadataResolved) return;
    let active = true;
    void getTrackMetadata(currentTrack.path)
      .then((metadata) => {
        if (!active) return;
        setQueue((current) => current.map((track) => track.id === currentTrack.id
          ? {
              ...track,
              title: metadata.title,
              artist: metadata.artist,
              album: metadata.album,
              artworkUrl: metadata.artworkUrl,
              metadataSource: metadata.source,
              metadataResolved: true,
            }
          : track));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const persistedSnapshot: PlayerSnapshot = {
    queue,
    currentTrackId: currentTrack?.id ?? null,
    currentTime,
    volume,
    shuffle,
    repeat,
    favouriteIds,
  };
  const latestSnapshot = useRef(persistedSnapshot);
  latestSnapshot.current = persistedSnapshot;
  const progressBucket = Math.floor(currentTime / 5);

  useEffect(() => {
    savePlayerSnapshot(userId, latestSnapshot.current);
  }, [currentTrack?.id, favouriteIds, queue, repeat, shuffle, userId, volume]);

  useEffect(() => {
    savePlayerProgress(userId, currentTrack?.id ?? null, currentTime);
  }, [currentTrack?.id, isPlaying, progressBucket, userId]);

  useEffect(() => {
    const flush = () => savePlayerProgress(
      userId,
      latestSnapshot.current.currentTrackId,
      latestSnapshot.current.currentTime,
    );
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [userId]);

  const play = useCallback((track: Track, nextQueue?: Track[]) => {
    const resolvedQueue = nextQueue?.length ? nextQueue : [track];
    const index = resolvedQueue.findIndex((candidate) => candidate.id === track.id);
    restoredProgress.current = null;
    shouldAutoplay.current = true;
    setCurrentTime(0);
    setQueue(resolvedQueue);
    setCurrentIndex(Math.max(index, 0));
  }, []);

  const enqueue = useCallback((track: Track) => {
    setQueue((current) => (current.some((candidate) => candidate.id === track.id) ? current : [...current, track]));
  }, []);

  const toggleFavourite = useCallback((track: Track) => {
    setFavouriteIds((current) => {
      const next = current.includes(track.id)
        ? current.filter((id) => id !== track.id)
        : [...current, track.id];
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) {
      shouldAutoplay.current = true;
      void requestPlayback(audio).catch(() => setError("Playback could not start."));
    } else {
      audio.pause();
    }
  }, [currentTrack]);

  const advance = useCallback(
    (direction: 1 | -1) => {
      if (queue.length === 0) return;
      restoredProgress.current = null;
      shouldAutoplay.current = true;
      setCurrentTime(0);
      setCurrentIndex((index) => {
        if (shuffle && queue.length > 1) {
          let next = index;
          while (next === index) next = Math.floor(Math.random() * queue.length);
          return next;
        }
        return (index + direction + queue.length) % queue.length;
      });
    },
    [queue.length, shuffle],
  );

  const next = useCallback(() => advance(1), [advance]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    advance(-1);
  }, [advance]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((value: number) => setVolumeState(Math.min(1, Math.max(0, value))), []);
  const toggleShuffle = useCallback(() => setShuffle((value) => !value), []);
  const cycleRepeat = useCallback(
    () => setRepeat((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off")),
    [],
  );

  const value = useMemo<PlayerState>(
    () => ({
      currentTrack,
      queue,
      isPlaying,
      currentTime,
      duration,
      volume,
      shuffle,
      repeat,
      favouriteIds,
      error,
      play,
      enqueue,
      toggleFavourite,
      toggle,
      previous,
      next,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
    }),
    [
      currentTrack,
      queue,
      isPlaying,
      currentTime,
      duration,
      volume,
      shuffle,
      repeat,
      favouriteIds,
      error,
      play,
      enqueue,
      toggleFavourite,
      toggle,
      previous,
      next,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          const pending = restoredProgress.current;
          if (!pending || pending.trackId !== currentTrack?.id) return;
          const maximum = Number.isFinite(event.currentTarget.duration)
            ? Math.max(0, event.currentTarget.duration - 0.25)
            : pending.time;
          const restoredTime = Math.min(pending.time, maximum);
          event.currentTarget.currentTime = restoredTime;
          setCurrentTime(restoredTime);
          restoredProgress.current = null;
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onError={() => setError("This track could not be loaded from WebDAV.")}
        onEnded={() => {
          if (repeat === "one" && audioRef.current) {
            audioRef.current.currentTime = 0;
            void requestPlayback(audioRef.current).catch(() => setError("Playback could not continue."));
          } else if (repeat === "all" || currentIndex < queue.length - 1) {
            next();
          } else {
            setIsPlaying(false);
          }
        }}
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider.");
  return value;
}
