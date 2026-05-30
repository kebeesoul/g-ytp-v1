"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Track } from "@/lib/schema";

interface TrackItemProps {
  track: Track;
  index: number;
  active: boolean;
  onEdit: (id: string, artist: string, title: string) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
}

const trackActionStyle = {
  fontSize: "9px",
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: "0",
} as const;

export function TrackItem({ track, index, active, onEdit, onDelete, onPlay }: TrackItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });

  const [editing, setEditing] = useState(false);
  const [editArtist, setEditArtist] = useState(track.artist);
  const [editTitle, setEditTitle] = useState(track.title);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function handleSave() {
    onEdit(track.id, editArtist.trim(), editTitle.trim() || track.filename);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  const durationMin = Math.floor(track.durationSec / 60);
  const durationSec = Math.floor(track.durationSec % 60);
  const durationStr = `${durationMin}:${String(durationSec).padStart(2, "0")}`;
  const displayName = track.artist.trim()
    ? `${track.artist} - ${track.title}`
    : track.title;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border bg-[#0b0b0b] px-2 py-2 transition-colors ${
        active
          ? "border-[var(--vm-cyan)]"
          : "border-[var(--vm-border)] hover:border-[var(--vm-border-strong)]"
      }`}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-[var(--vm-muted)] hover:text-[var(--vm-cyan)] active:cursor-grabbing"
        aria-label="드래그해서 순서 변경"
      >
        ⠿
      </button>

      {/* 순서 번호 */}
      <span className="w-6 shrink-0 text-center text-xs text-[var(--vm-muted)]">
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* 트랙 정보 */}
      {editing ? (
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            autoFocus
            value={editArtist}
            onChange={(e) => setEditArtist(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="아티스트"
            className="vm-input flex-1 px-2 py-1"
          />
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="곡명"
            className="vm-input flex-1 px-2 py-1"
          />
          <button
            onClick={handleSave}
            className="vm-button-secondary px-2 py-1"
          >
            저장
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--vm-text)]" title={displayName}>
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-[var(--vm-muted)]">{durationStr}</span>
        </div>
      )}

      {/* 액션 버튼 */}
      {!editing && (
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onPlay(track.id)}
            className="px-0 py-0 text-[var(--vm-subtle)] hover:text-[var(--vm-cyan)]"
            style={trackActionStyle}
            aria-label="재생"
          >
            PLAY
          </button>
          <button
            onClick={() => {
              setEditArtist(track.artist);
              setEditTitle(track.title);
              setEditing(true);
            }}
            className="px-0 py-0 text-[var(--vm-subtle)] hover:text-white"
            style={trackActionStyle}
            aria-label="편집"
          >
            EDIT
          </button>
          <button
            onClick={() => onDelete(track.id)}
            className="px-0 py-0 text-[var(--vm-subtle)] hover:text-[var(--vm-error)]"
            style={trackActionStyle}
            aria-label="삭제"
          >
            DEL
          </button>
        </div>
      )}
    </div>
  );
}
