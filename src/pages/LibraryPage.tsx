import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Plus, Search, X } from "lucide-react";
import { listWebDavItems } from "../api";
import { TrackRow, trackFromItem } from "../components/TrackRow";
import { usePlayer } from "../state/PlayerContext";
import type { AppSection, WebDavItem, WebDavSettings } from "../types";

type LibraryMode = "folders" | "tracks" | "favourites";

interface LibraryPageProps {
  settings: WebDavSettings;
  onNavigate: (section: AppSection) => void;
}

export function LibraryPage({ settings, onNavigate }: LibraryPageProps) {
  const player = usePlayer();
  const [items, setItems] = useState<WebDavItem[]>([]);
  const [mode, setMode] = useState<LibraryMode>("folders");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [descending, setDescending] = useState(false);
  const [loading, setLoading] = useState(settings.configured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.configured) return;
    setLoading(true);
    listWebDavItems()
      .then((payload) => setItems(payload.items))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Library could not be loaded."))
      .finally(() => setLoading(false));
  }, [settings.configured, settings.endpoint]);

  const tracks = useMemo(() => items.filter((item) => !item.isDirectory).map(trackFromItem), [items]);
  const visibleItems = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (mode === "folders" && !item.isDirectory) return false;
      if (mode !== "folders" && item.isDirectory) return false;
      if (mode === "favourites" && !player.favouriteIds.includes(item.path)) return false;
      return !lowered || item.name.toLowerCase().includes(lowered);
    });
    return filtered.sort((left, right) => {
      const order = left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
      return descending ? -order : order;
    });
  }, [items, mode, search, descending, player.favouriteIds]);

  return (
    <section className="page library-page">
      <header className="page-header library-header">
        <h1>Library</h1>
        <div className="header-actions">
          <div className="segmented-control" aria-label="Library view">
            {(["folders", "tracks", "favourites"] as LibraryMode[]).map((value) => (
              <button key={value} className={mode === value ? "active" : ""} type="button" onClick={() => setMode(value)}>
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <button className="icon-button" type="button" aria-label="Reverse sort order" onClick={() => setDescending((value) => !value)}>
            <ArrowDownUp />
          </button>
          <button className="icon-button" type="button" aria-label="Open WebDAV" onClick={() => onNavigate("webdav")}>
            <Plus />
          </button>
          <button className="icon-button" type="button" aria-label="Search library" onClick={() => setShowSearch((value) => !value)}>
            {showSearch ? <X /> : <Search />}
          </button>
        </div>
      </header>

      {showSearch && (
        <div className="search-field">
          <Search size={18} />
          <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, artist, album, or folder" />
        </div>
      )}

      <div className="page-content media-list-wrap">
        <div className="section-label">{mode[0].toUpperCase() + mode.slice(1)}</div>
        {!settings.configured ? (
          <EmptyState title="Connect a WebDAV server" detail="Add your server address and credentials before browsing music." action="Open Settings" onAction={() => onNavigate("settings")} />
        ) : loading ? (
          <div className="loading-state">Loading your library…</div>
        ) : error ? (
          <EmptyState title="Library unavailable" detail={error} action="Open Settings" onAction={() => onNavigate("settings")} />
        ) : visibleItems.length === 0 ? (
          mode === "favourites" && !search ? (
            <EmptyState title="No favourites yet" detail="Add tracks from Now Playing, then find them here." />
          ) :
          <EmptyState title={search ? "No matching music" : "No music in this folder"} detail={search ? "Try another title, artist, album, or folder." : "EchoVault shows supported audio files and folders."} />
        ) : (
          <div className="media-list">
            {visibleItems.map((item) => (
              <TrackRow
                key={item.path}
                item={item}
                onOpenFolder={() => onNavigate("webdav")}
                onPlay={(track) => player.play(track, tracks)}
                onEnqueue={player.enqueue}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <img src="/app-logo.png" alt="" />
      <h2>{title}</h2>
      <p>{detail}</p>
      {action && onAction && <button className="button primary" type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}
