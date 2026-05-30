"use client";

import type { ThumbnailPreset, ThumbnailSettings } from "@/lib/thumbnail/schema";

interface PresetSlotsProps {
  presets: ThumbnailPreset[];
  settings: ThumbnailSettings;
  onLoad: (settings: ThumbnailSettings) => void;
  onRefresh: () => Promise<void>;
  onStatus: (message: string | null) => void;
}

const SLOT_INDEXES = [0, 1, 2, 3, 4, 5] as const;

async function requestJson(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `request failed: ${res.status}`);
  }
}

export function PresetSlots({ presets, settings, onLoad, onRefresh, onStatus }: PresetSlotsProps) {
  async function save(slotIndex: number, fallbackName: string) {
    const prompted = window.prompt("Preset name", fallbackName);
    const name = prompted?.trim();
    if (!name) return;

    const res = await fetch("/api/thumbnail/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotIndex, name, settings }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `save failed: ${res.status}`);
    }
    await onRefresh();
    onStatus(`Saved slot ${slotIndex + 1}`);
  }

  async function remove(slotIndex: number) {
    await requestJson("/api/thumbnail/presets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotIndex }),
    });
    await onRefresh();
    onStatus(`Deleted slot ${slotIndex + 1}`);
  }

  async function rename(slotIndex: number, name: string) {
    if (!name.trim()) return;
    await requestJson("/api/thumbnail/presets/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotIndex, name: name.trim() }),
    });
    await onRefresh();
    onStatus(`Renamed slot ${slotIndex + 1}`);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SLOT_INDEXES.map((slotIndex) => {
        const preset = presets.find((p) => p.slotIndex === slotIndex);
        return (
          <div key={slotIndex} className="vm-panel flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2">
              <span className="vm-label w-8">#{slotIndex + 1}</span>
              {preset ? (
                <input
                  className="vm-input h-8 py-1 text-[11px]"
                  defaultValue={preset.name}
                  maxLength={30}
                  onBlur={(event) => {
                    void rename(slotIndex, event.target.value).catch((err: unknown) =>
                      onStatus(err instanceof Error ? err.message : "Rename failed")
                    );
                  }}
                />
              ) : (
                <span className="text-[11px] text-[var(--vm-muted)]">Empty slot</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {preset ? (
                <>
                  <button type="button" className="vm-button-secondary px-3 py-2" onClick={() => onLoad(preset.settings)}>
                    Load
                  </button>
                  <button
                    type="button"
                    className="vm-button-secondary px-3 py-2"
                    onClick={() => {
                      void save(slotIndex, preset.name).catch((err: unknown) =>
                        onStatus(err instanceof Error ? err.message : "Update failed")
                      );
                    }}
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    className="vm-button-secondary vm-button-danger px-3 py-2"
                    onClick={() => {
                      void remove(slotIndex).catch((err: unknown) =>
                        onStatus(err instanceof Error ? err.message : "Delete failed")
                      );
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="vm-button-secondary px-3 py-2"
                  onClick={() => {
                    void save(slotIndex, `Preset ${slotIndex + 1}`).catch((err: unknown) =>
                      onStatus(err instanceof Error ? err.message : "Save failed")
                    );
                  }}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
