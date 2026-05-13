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
import { useRef } from "react";
import type { Track } from "@/lib/schema";
import { TrackItem } from "./TrackItem";

interface TrackListProps {
  tracks: Track[];
  onReorder: (tracks: Track[]) => void;
  onEdit: (id: string, artist: string, title: string) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
  onFilesAdded: (files: FileList) => void;
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

  function handleDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      onFilesAdded(e.dataTransfer.files);
    }
  }

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

      {/* 음원 추가 dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropZoneDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-gray-600 py-4 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-300"
      >
        + 음원 추가 (클릭 또는 드래그)
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFilesAdded(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
