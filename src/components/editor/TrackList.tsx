"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useRef, useState } from "react";
import type { Track } from "@/lib/schema";
import { TrackItem } from "./TrackItem";

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"]);

interface TrackListProps {
  tracks: Track[];
  onReorder: (tracks: Track[]) => void;
  onEdit: (id: string, artist: string, title: string) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
  onFilesAdded: (files: File[]) => Promise<void> | void;
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.has(ext);
}

export function TrackList({
  tracks,
  onReorder,
  onEdit,
  onDelete,
  onPlay,
  onFilesAdded,
}: TrackListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tracks.findIndex((t) => t.id === active.id);
    const newIndex = tracks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tracks, oldIndex, newIndex).map((t, i) => ({
      ...t,
      order: i,
    }));
    onReorder(reordered);
  }

  async function ingestFiles(files: File[]): Promise<void> {
    if (isUploading) return;

    const accepted = files.filter(isAudioFile);
    const rejectedCount = files.length - accepted.length;

    if (rejectedCount > 0) {
      setDropError(`오디오가 아닌 파일 ${rejectedCount}개는 추가하지 않았습니다.`);
    } else {
      setDropError(null);
    }

    if (accepted.length === 0) return;

    setIsUploading(true);
    try {
      await onFilesAdded(accepted);
    } catch (err) {
      setDropError(err instanceof Error ? err.message : "음원 ingest에 실패했습니다.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading || !Array.from(e.dataTransfer.types).includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    void ingestFiles(Array.from(e.dataTransfer.files));
  }

  const dropzoneLabel = isUploading
    ? "음원 ingest 중..."
    : isDraggingFiles
      ? "여기에 음원 파일 놓기"
      : "+ 음원 추가 (클릭 또는 드래그)";

  const dropzoneClass = isDraggingFiles
    ? "border-blue-400 bg-blue-500/10 text-blue-200"
    : "border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300";

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tracks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1">
            {tracks.map((track, index) => (
              <TrackItem
                key={track.id}
                track={track}
                index={index}
                onEdit={onEdit}
                onDelete={onDelete}
                onPlay={onPlay}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!isUploading) fileInputRef.current?.click();
        }}
        disabled={isUploading}
        className={`flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed py-4 text-sm transition disabled:cursor-wait disabled:opacity-70 ${dropzoneClass}`}
      >
        {dropzoneLabel}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void ingestFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      {dropError && <p className="text-xs text-red-400">{dropError}</p>}
    </div>
  );
}
