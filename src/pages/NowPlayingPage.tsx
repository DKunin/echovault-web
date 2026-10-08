import {
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { usePlayer } from "../state/PlayerContext";
import { EmptyState } from "./LibraryPage";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(Math.max(seconds, 0) / 60);
  return `${minutes}:${String(Math.floor(Math.max(seconds, 0) % 60)).padStart(2, "0")}`;
}

export function NowPlayingPage() {
  const player = usePlayer();
  const [showQueue, setShowQueue] = useState(false);
  if (!player.currentTrack) {
    return (
      <section className="page">
        <header className="page-header"><h1>Now Playing</h1></header>
        <EmptyState title="Nothing Playing" detail="Choose a track from Library." />
      </section>
    );
  }

  const remaining = Math.max(player.duration - player.currentTime, 0);
  return (
    <section className="page now-playing-page">
      <header className="page-header">
        <h1>Now Playing</h1>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Queue" onClick={() => setShowQueue((value) => !value)}><ListMusic /></button>
          <button
            className={player.favouriteIds.includes(player.currentTrack.id) ? "icon-button favourite" : "icon-button"}
            type="button"
            aria-label={player.favouriteIds.includes(player.currentTrack.id) ? "Remove from favourites" : "Add to favourites"}
            onClick={() => player.toggleFavourite(player.currentTrack!)}
          ><Heart fill={player.favouriteIds.includes(player.currentTrack.id) ? "currentColor" : "none"} /></button>
        </div>
      </header>
      <div className="now-playing-content">
        <div className="hero-artwork"><img src="/app-logo.png" alt="EchoVault artwork" /></div>
        <div className="player-detail">
          <p className="eyebrow">NOW PLAYING</p>
          <h2>{player.currentTrack.title}</h2>
          <h3>{player.currentTrack.artist}</h3>
          <p className="album-name">{player.currentTrack.album}</p>
          <div className="timeline">
            <input
              type="range"
              min="0"
              max={player.duration || 1}
              value={Math.min(player.currentTime, player.duration || 1)}
              onChange={(event) => player.seek(Number(event.target.value))}
              aria-label="Playback position"
            />
            <div><span>{formatTime(player.currentTime)}</span><span>-{formatTime(remaining)}</span></div>
          </div>
          <div className="transport-controls">
            <button className={player.shuffle ? "active" : ""} type="button" aria-label="Shuffle" onClick={player.toggleShuffle}><Shuffle /></button>
            <button type="button" aria-label="Previous track" onClick={player.previous}><SkipBack fill="currentColor" /></button>
            <button className="transport-play" type="button" aria-label={player.isPlaying ? "Pause" : "Play"} onClick={player.toggle}>
              {player.isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <button type="button" aria-label="Next track" onClick={player.next}><SkipForward fill="currentColor" /></button>
            <button className={player.repeat !== "off" ? "active" : ""} type="button" aria-label={`Repeat ${player.repeat}`} onClick={player.cycleRepeat}>
              {player.repeat === "one" ? <Repeat1 /> : <Repeat />}
            </button>
          </div>
          <div className="volume-control">
            <Volume2 size={20} />
            <input type="range" min="0" max="1" step="0.01" value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label="Volume" />
          </div>
          {player.error && <p className="playback-error">{player.error}</p>}
        </div>
      </div>
      {showQueue && (
        <aside className="queue-drawer" aria-label="Playback queue">
          <div><h2>Queue</h2><button type="button" onClick={() => setShowQueue(false)}>Done</button></div>
          {player.queue.map((track) => (
            <button key={track.id} type="button" className={track.id === player.currentTrack?.id ? "active" : ""} onClick={() => player.play(track, player.queue)}>
              <strong>{track.title}</strong><span>{track.artist}</span>
            </button>
          ))}
        </aside>
      )}
    </section>
  );
}
