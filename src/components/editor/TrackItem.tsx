"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Track } from "@/lib/schema";

interface TrackItemProps {
  track: Track;
  index: number;
  onEdit: (id: string, artist: string, title: string) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
}

export function TrackItem({ track, index, onEdit, onDelete, onPlay }: TrackItemProps) {
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
    onEdit(track.id, editArtist.trim() || "Unknown Artist", editTitle.trim() || track.filename);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  const durationMin = Math.floor(track.durationSec / 60);
  const durationSec = Math.floor(track.durationSec % 60);
  const durationStr = `${durationMin}:${String(durationSec).padStart(2, "0")}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-500 hover:text-gray-300 active:cursor-grabbing"
        aria-label="드래그해서 순서 변경"
      >
        ⠿
      </button>

      {/* 순서 번호 */}
      <span className="w-6 shrink-0 text-center text-xs text-gray-500">
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* 트랙 정보 */}
      {editing ? (
        <div className="flex flex-1 gap-2">
          <input
            autoFocus
            value={editArtist}
            onChange={(e) => setEditArtist(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="아티스트"
            className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-white focus:outline-none"
          />
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="곡명"
            className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-white focus:outline-none"
          />
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
          >
            저장
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1 overflow-hidden">
          <span className="truncate text-sm text-white">
            <span className="text-gray-400">{track.artist}</span>
            {" — "}
            <span>{track.title}</span>
          </span>
          <span className="ml-auto shrink-0 text-xs text-gray-500">{durationStr}</span>
        </div>
      )}

      {/* 액션 버튼 */}
      {!editing && (
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onPlay(track.id)}
            className="rounded p-1 text-gray-400 hover:text-white"
            aria-label="재생"
          >
            ▶
          </button>
          <button
            onClick={() => {
              setEditArtist(track.artist);
              setEditTitle(track.title);
              setEditing(true);
            }}
            className="rounded p-1 text-gray-400 hover:text-white"
            aria-label="편집"
          >
            ✏
          </button>
          <button
            onClick={() => onDelete(track.id)}
            className="rounded p-1 text-gray-400 hover:text-red-400"
            aria-label="삭제"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
