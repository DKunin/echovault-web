import { ListMusic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { usePlayer } from "../state/PlayerContext";

interface MiniPlayerProps {
  onOpenNowPlaying: () => void;
}

export function MiniPlayer({ onOpenNowPlaying }: MiniPlayerProps) {
  const player = usePlayer();
  if (!player.currentTrack) return null;

  return (
    <div className="mini-player" aria-label="Current playback">
      <button className="mini-identity" type="button" onClick={onOpenNowPlaying}>
        <img src="/app-logo.png" alt="" />
        <span>
          <strong>{player.currentTrack.title}</strong>
          <small>{player.currentTrack.artist}</small>
        </span>
      </button>
      <div className="mini-controls">
        <button type="button" aria-label="Previous track" onClick={player.previous}>
          <SkipBack fill="currentColor" />
        </button>
        <button className="primary-play" type="button" aria-label={player.isPlaying ? "Pause" : "Play"} onClick={player.toggle}>
          {player.isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next track" onClick={player.next}>
          <SkipForward fill="currentColor" />
        </button>
        <button className="queue-button" type="button" aria-label={`${player.queue.length} tracks in queue`} onClick={onOpenNowPlaying}>
          <ListMusic />
        </button>
      </div>
    </div>
  );
}
