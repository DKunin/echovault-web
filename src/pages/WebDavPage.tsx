import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Home, RefreshCw } from "lucide-react";
import { listWebDavItems } from "../api";
import { TrackRow, trackFromItem } from "../components/TrackRow";
import { usePlayer } from "../state/PlayerContext";
import type { AppSection, WebDavItem, WebDavSettings } from "../types";
import { EmptyState } from "./LibraryPage";

interface WebDavPageProps {
  settings: WebDavSettings;
  onNavigate: (section: AppSection) => void;
}

function parentPath(path: string): string {
  const parts = path.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.length ? `${parts.join("/")}/` : "";
}

export function WebDavPage({ settings, onNavigate }: WebDavPageProps) {
  const player = usePlayer();
  const [path, setPath] = useState("");
  const [items, setItems] = useState<WebDavItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!settings.configured) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await listWebDavItems(path);
      setItems(payload.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This folder could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [path, settings.configured]);

  useEffect(() => void load(), [load, settings.endpoint]);
  const tracks = useMemo(() => items.filter((item) => !item.isDirectory).map(trackFromItem), [items]);

  const breadcrumbParts = path.replace(/\/$/, "").split("/").filter(Boolean);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>WebDAV</h1>
          <div className="breadcrumbs">
            <button type="button" onClick={() => setPath("")}><Home size={14} /> Music</button>
            {breadcrumbParts.map((part, index) => (
              <span key={`${part}-${index}`}><ChevronRight size={13} /> {decodeURIComponent(part)}</span>
            ))}
          </div>
        </div>
        <button className="icon-button" type="button" aria-label="Refresh WebDAV folder" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} />
        </button>
      </header>
      <div className="page-content media-list-wrap">
        {!settings.configured ? (
          <EmptyState title="Connect a WebDAV server" detail="Verify a server and browse its audio folders from EchoVault." action="Open Settings" onAction={() => onNavigate("settings")} />
        ) : loading && items.length === 0 ? (
          <div className="loading-state">Loading WebDAV…</div>
        ) : error ? (
          <EmptyState title="Could not load WebDAV" detail={error} action="Try Again" onAction={() => void load()} />
        ) : (
          <>
            {path && <button className="parent-row" type="button" onClick={() => setPath(parentPath(path))}>← Back to parent folder</button>}
            <div className="directory-summary">
              <span>{items.filter((item) => item.isDirectory).length} folders</span>
              <span>{tracks.length} tracks</span>
            </div>
            {items.length === 0 ? (
              <EmptyState title="No music in this folder" detail="EchoVault shows supported audio files and subfolders." />
            ) : (
              <div className="media-list">
                {items.map((item) => (
                  <TrackRow
                    key={item.path}
                    item={item}
                    onOpenFolder={(folder) => setPath(folder.path)}
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
