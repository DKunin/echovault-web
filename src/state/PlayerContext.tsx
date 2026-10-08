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
import { streamUrl } from "../api";
import type { Track } from "../types";

type RepeatMode = "off" | "all" | "one";

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

export function PlayerProvider({ children }: PropsWithChildren) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const shouldAutoplay = useRef(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.72);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const currentTrack = currentIndex >= 0 ? queue[currentIndex] ?? null : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = streamUrl(currentTrack.path);
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    if (shouldAutoplay.current) {
      void audio.play().catch(() => setError("Playback could not start. Try pressing Play."));
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: [{ src: "/app-logo.png", sizes: "1200x1200", type: "image/png" }],
      });
    }
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const play = useCallback((track: Track, nextQueue?: Track[]) => {
    const resolvedQueue = nextQueue?.length ? nextQueue : [track];
    const index = resolvedQueue.findIndex((candidate) => candidate.id === track.id);
    shouldAutoplay.current = true;
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
      void audio.play().catch(() => setError("Playback could not start."));
    } else {
      audio.pause();
    }
  }, [currentTrack]);

  const advance = useCallback(
    (direction: 1 | -1) => {
      if (queue.length === 0) return;
      shouldAutoplay.current = true;
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
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onError={() => setError("This track could not be loaded from WebDAV.")}
        onEnded={() => {
          if (repeat === "one" && audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
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
