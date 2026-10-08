import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ListMusic, Play, Shuffle, Upload } from "lucide-react";
import { shuffledTracks } from "../music-library";
import {
  decodePlaylist,
  defaultPlaylistFilename,
  encodePlaylist,
  importedPlaylist,
  maximumPlaylistFileSize,
  type MusicPlaylist,
  playlistFromTracks,
  resolvePlaylistTracks,
} from "../playlist-document";
import { usePlayer } from "../state/PlayerContext";
import type { WebDavSettings } from "../types";

interface PlaylistsPageProps {
  settings: WebDavSettings;
  userId: string;
}

function storedPlaylists(storageKey: string): MusicPlaylist[] {
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? (JSON.parse(saved) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((playlist): playlist is MusicPlaylist => {
      try {
        encodePlaylist(playlist as MusicPlaylist);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function savePlaylists(storageKey: string, playlists: MusicPlaylist[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(playlists));
  } catch {
    // Import still succeeds for this session when browser storage is unavailable.
  }
}

function downloadPlaylist(playlist: MusicPlaylist) {
  const blob = new Blob([encodePlaylist(playlist)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = defaultPlaylistFilename(playlist.name);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PlaylistsPage({ settings, userId }: PlaylistsPageProps) {
  const player = usePlayer();
  const storageKey = `echo-vault-playlists:${userId}`;
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>(() => storedPlaylists(storageKey));
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedID) ?? null,
    [playlists, selectedID],
  );

  const replacePlaylists = (next: MusicPlaylist[]) => {
    setPlaylists(next);
    savePlaylists(storageKey, next);
  };

  const exportQueue = () => {
    setError(null);
    if (!settings.configured || !settings.endpoint) {
      setError("Connect the remote library before exporting WebDAV references.");
      return;
    }
    if (player.queue.length === 0) {
      setError("Add tracks to the queue before exporting it.");
      return;
    }
    try {
      downloadPlaylist(playlistFromTracks("Current Queue", player.queue, settings.endpoint));
      setStatus("Current Queue exported in the EchoVault playlist format.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Current Queue could not be exported.");
    }
  };

  const exportSelected = () => {
    if (!selected) return;
    setError(null);
    try {
      downloadPlaylist(selected);
      setStatus(`“${selected.name}” exported in the EchoVault playlist format.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This playlist could not be exported.");
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStatus(null);
    try {
      if (file.size > maximumPlaylistFileSize) throw new Error("This playlist file is too large to import.");
      const parsed = decodePlaylist(await file.text());
      const imported = importedPlaylist(parsed, playlists.map((playlist) => playlist.name));
      replacePlaylists([...playlists, imported]);
      setSelectedID(imported.id);
      setStatus(`“${imported.name}” imported with ${imported.items.length} items.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import this playlist.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const playPlaylist = async (playlist: MusicPlaylist, shuffled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const tracks = await resolvePlaylistTracks(playlist, settings.endpoint);
      if (tracks.length === 0) throw new Error("No playlist items match the current remote library.");
      const queue = shuffled ? shuffledTracks(tracks) : tracks;
      player.play(queue[0], queue);
      setStatus(`${shuffled ? "Shuffling" : "Playing"} ${queue.length} tracks from “${playlist.name}”.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This playlist could not be played.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header playlist-header">
        <div className="playlist-heading">
          {selected && (
            <button className="icon-button compact-icon" type="button" aria-label="Back to playlists" onClick={() => setSelectedID(null)}>
              <ArrowLeft />
            </button>
          )}
          <h1>{selected?.name ?? "Playlists"}</h1>
        </div>
        <div className="header-actions playlist-header-actions">
          {selected ? (
            <button className="button secondary compact" type="button" onClick={exportSelected}>
              <Download size={17} /> <span>Export Playlist</span>
            </button>
          ) : (
            <button className="button secondary compact" type="button" disabled={player.queue.length === 0} onClick={exportQueue}>
              <Download size={17} /> <span>Export Queue</span>
            </button>
          )}
          <button className="button primary compact" type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={17} /> <span>Import Playlist…</span>
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept=".echovaultplaylist,application/json"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </div>
      </header>
      <div className="page-content playlist-list">
        {status && <div className="playlist-notice success" role="status">{status}</div>}
        {error && <div className="playlist-notice error" role="alert">{error}</div>}

        {selected ? (
          <>
            <div className="playlist-detail-hero">
              <span><ListMusic /></span>
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.items.length} items</p>
                <div className="playlist-play-actions">
                  <button className="button primary compact" type="button" disabled={busy} onClick={() => void playPlaylist(selected, false)}>
                    <Play size={16} fill="currentColor" /> Play
                  </button>
                  <button className="button secondary compact" type="button" disabled={busy} onClick={() => void playPlaylist(selected, true)}>
                    <Shuffle size={16} /> Shuffle
                  </button>
                </div>
              </div>
            </div>
            <div className="section-label">Contents</div>
            {selected.items.map((item) => (
              <div className="playlist-track" key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.subtitle || (item.kind === "folder" ? "Folder" : "Unknown Artist")}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="section-label">Playback</div>
            <div className="playlist-card">
              <span><ListMusic /></span>
              <div><strong>Current Queue</strong><small>{player.queue.length} tracks</small></div>
            </div>
            <div className="section-label playlist-section-label">Your Playlists</div>
            {playlists.length === 0 ? (
              <div className="playlist-empty">
                <ListMusic />
                <strong>No imported playlists</strong>
                <span>Import a .echovaultplaylist file from EchoVault on iOS or macOS.</span>
              </div>
            ) : playlists.map((playlist) => (
              <button className="playlist-card playlist-card-button" key={playlist.id} type="button" onClick={() => setSelectedID(playlist.id)}>
                <span><ListMusic /></span>
                <div><strong>{playlist.name}</strong><small>{playlist.items.length} items</small></div>
              </button>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
