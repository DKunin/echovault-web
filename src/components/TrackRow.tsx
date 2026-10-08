import { Folder, MoreHorizontal, Music2, Play } from "lucide-react";
import type { Track, WebDavItem } from "../types";

export function trackFromItem(item: WebDavItem): Track {
  const withoutExtension = item.name.replace(/\.[^.]+$/, "");
  const split = withoutExtension.split(/\s+-\s+/, 2);
  const parent = item.path.split("/").filter(Boolean).at(-2);
  return {
    id: item.path,
    title: split.length === 2 ? split[1] : withoutExtension,
    artist: split.length === 2 ? split[0] : "Unknown Artist",
    album: parent ? decodeURIComponent(parent) : "WebDAV",
    path: item.path,
  };
}

interface TrackRowProps {
  item: WebDavItem;
  onOpenFolder?: (item: WebDavItem) => void;
  onPlay?: (track: Track) => void;
  onEnqueue?: (track: Track) => void;
}

export function TrackRow({ item, onOpenFolder, onPlay, onEnqueue }: TrackRowProps) {
  const track = item.isDirectory ? null : trackFromItem(item);
  return (
    <div className="media-row">
      <button
        className="media-row-main"
        type="button"
        onClick={() => (item.isDirectory ? onOpenFolder?.(item) : track && onPlay?.(track))}
      >
        <span className={item.isDirectory ? "media-art folder" : "media-art"}>
          {item.isDirectory ? <Folder fill="currentColor" /> : <Music2 />}
          {!item.isDirectory && <span className="row-play"><Play size={16} fill="currentColor" /></span>}
        </span>
        <span className="media-copy">
          <strong>{track?.title ?? item.name}</strong>
          <small>
            {item.isDirectory
              ? "Folder"
              : `${track?.artist ?? "Unknown Artist"}${item.contentLength ? ` · ${formatBytes(item.contentLength)}` : ""}`}
          </small>
        </span>
      </button>
      <button
        className="row-action"
        type="button"
        aria-label={item.isDirectory ? `Open ${item.name}` : `Add ${item.name} to queue`}
        title={item.isDirectory ? "Open folder" : "Add to queue"}
        onClick={() => (item.isDirectory ? onOpenFolder?.(item) : track && onEnqueue?.(track))}
      >
        <MoreHorizontal />
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
