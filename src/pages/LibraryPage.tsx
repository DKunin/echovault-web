import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronRight, Home, Play, Search, Shuffle, X } from "lucide-react";
import { listWebDavItems } from "../api";
import { TrackRow } from "../components/TrackRow";
import { collectFolderTracks, shuffledTracks, trackFromItem } from "../music-library";
import { usePlayer } from "../state/PlayerContext";
import type { AppSection, WebDavItem, WebDavSettings } from "../types";

type LibraryMode = "folders" | "tracks" | "favourites";

interface LibraryPageProps {
  settings: WebDavSettings;
  onNavigate: (section: AppSection) => void;
}

function parentPath(path: string): string {
  const parts = path.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.length ? `${parts.join("/")}/` : "";
}

export function LibraryPage({ settings, onNavigate }: LibraryPageProps) {
  const player = usePlayer();
  const [path, setPath] = useState("");
  const [items, setItems] = useState<WebDavItem[]>([]);
  const [mode, setMode] = useState<LibraryMode>("folders");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [descending, setDescending] = useState(false);
  const [loading, setLoading] = useState(settings.configured);
  const [error, setError] = useState<string | null>(null);
  const [folderOperation, setFolderOperation] = useState<"play" | "shuffle" | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!settings.configured) return;
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const payload = await listWebDavItems(path);
      setItems(payload.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [path, settings.configured]);

  useEffect(() => void load(), [load, settings.endpoint]);

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

  const breadcrumbParts = path.replace(/\/$/, "").split("/").filter(Boolean);

  const openBreadcrumb = (index: number) => {
    setPath(`${breadcrumbParts.slice(0, index + 1).join("/")}/`);
    setSearch("");
  };

  const playFolder = async (shuffled: boolean) => {
    if (!path || folderOperation) return;
    setFolderOperation(shuffled ? "shuffle" : "play");
    setFolderError(null);
    try {
      const folderTracks = await collectFolderTracks(path);
      if (folderTracks.length === 0) throw new Error("This folder has no supported audio files.");
      const queue = shuffled ? shuffledTracks(folderTracks) : folderTracks;
      player.play(queue[0], queue);
    } catch (reason) {
      setFolderError(reason instanceof Error ? reason.message : "This folder could not be played.");
    } finally {
      setFolderOperation(null);
    }
  };

  return (
    <section className={showSearch ? "page library-page search-open" : "page library-page"}>
      <header className="page-header library-header">
        <div className="library-title">
          <h1>Library</h1>
          {path && (
            <div className="breadcrumbs" aria-label="Current folder">
              <button type="button" onClick={() => setPath("")}><Home size={14} /> Music</button>
              {breadcrumbParts.map((part, index) => (
                <span key={`${part}-${index}`}>
                  <ChevronRight size={13} />
                  <button type="button" onClick={() => openBreadcrumb(index)}>{decodeURIComponent(part)}</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="header-actions">
          <div className="segmented-control" aria-label="Library view">
            {(["folders", "tracks", "favourites"] as LibraryMode[]).map((value) => (
              <button key={value} className={mode === value ? "active" : ""} type="button" onClick={() => setMode(value)}>
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <button className="icon-button sort-button" type="button" aria-label="Reverse sort order" onClick={() => setDescending((value) => !value)}>
            <ArrowDownUp />
          </button>
          <button className="icon-button search-button" type="button" aria-label="Search library" onClick={() => setShowSearch((value) => !value)}>
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
        {!settings.configured ? (
          <EmptyState title="Connect a WebDAV server" detail="Add your server address and credentials before browsing music." action="Open Settings" onAction={() => onNavigate("settings")} />
        ) : loading && items.length === 0 ? (
          <div className="loading-state">Loading your library…</div>
        ) : error ? (
          <EmptyState title="Library unavailable" detail={error} action="Try Again" onAction={() => void load()} />
        ) : (
          <>
            {path && <button className="parent-row" type="button" onClick={() => setPath(parentPath(path))}>← Back to parent folder</button>}
            <div className="directory-toolbar">
              <div className="directory-summary">
                <span>{items.filter((item) => item.isDirectory).length} folders</span>
                <span>{tracks.length} tracks</span>
              </div>
              {path && (
                <div className="folder-actions">
                  <button className="button primary compact" type="button" disabled={folderOperation !== null} onClick={() => void playFolder(false)}>
                    <Play size={16} fill="currentColor" /> {folderOperation === "play" ? "Scanning…" : "Play Folder"}
                  </button>
                  <button className="button secondary compact" type="button" disabled={folderOperation !== null} onClick={() => void playFolder(true)}>
                    <Shuffle size={16} /> {folderOperation === "shuffle" ? "Scanning…" : "Shuffle Folder"}
                  </button>
                </div>
              )}
            </div>
            {folderError && <div className="inline-error" role="alert">{folderError}</div>}
            <div className="section-label">{mode[0].toUpperCase() + mode.slice(1)}</div>
            {visibleItems.length === 0 ? (
              mode === "favourites" && !search ? (
                <EmptyState title="No favourites yet" detail="Add tracks from Now Playing, then find them here." />
              ) : (
                <EmptyState title={search ? "No matching music" : "No music in this view"} detail={search ? "Try another title, artist, album, or folder." : "Switch views to see this folder’s other contents."} />
              )
            ) : (
              <div className="media-list">
                {visibleItems.map((item) => (
                  <TrackRow
                    key={item.path}
                    item={item}
                    onOpenFolder={(folder) => {
                      setPath(folder.path);
                      setSearch("");
                    }}
                    onPlay={(track) => player.play(track, tracks)}
                    onEnqueue={player.enqueue}
                  />
                ))}
              </div>
            )}
          </>
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
