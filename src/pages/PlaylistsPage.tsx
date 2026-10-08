import { ListMusic } from "lucide-react";
import { usePlayer } from "../state/PlayerContext";

export function PlaylistsPage() {
  const player = usePlayer();
  return (
    <section className="page">
      <header className="page-header"><h1>Playlists</h1></header>
      <div className="page-content playlist-list">
        <div className="playlist-card">
          <span><ListMusic /></span>
          <div><strong>Current Queue</strong><small>{player.queue.length} tracks</small></div>
        </div>
        {player.queue.map((track) => (
          <button className="playlist-track" key={track.id} type="button" onClick={() => player.play(track, player.queue)}>
            <strong>{track.title}</strong><span>{track.artist}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
