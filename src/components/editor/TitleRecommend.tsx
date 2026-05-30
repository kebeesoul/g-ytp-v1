"use client";

import { useState } from "react";
import { CATEGORY_KEYS } from "@/lib/titleRecommend/categories";
import type { Category } from "@/lib/titleRecommend/categories";
import { TITLE_TONE_KEYS } from "@/lib/titleRecommend/tones";
import type { TitleTone } from "@/lib/titleRecommend/tones";
import type { Track } from "@/lib/schema";

interface TitleRecommendProps {
  tracks: Track[];
  onSelect: (title: string) => void;
}

type Step = "idle" | "category" | "tone" | "loading" | "result" | "error";
const PREFERRED_TITLES_KEY = "g-ytp-v1:title-recommend:preferred";
const MAX_PREFERRED_TITLES = 24;
const recommendTitleStyle = {
  fontSize: "14px",
  fontWeight: 400,
  lineHeight: 1.45,
  letterSpacing: "0",
} as const;

const recommendControlStyle = {
  fontSize: "10px",
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: "0",
} as const;

function normalizeTitleText(title: string): string {
  return title.normalize("NFKC");
}

function readPreferredTitles(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFERRED_TITLES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function savePreferredTitle(title: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeTitleText(title).trim();
  if (!normalized) return;
  const previous = readPreferredTitles().filter(
    (item) => normalizeTitleText(item).trim() !== normalized
  );
  window.localStorage.setItem(
    PREFERRED_TITLES_KEY,
    JSON.stringify([...previous, normalized].slice(-MAX_PREFERRED_TITLES))
  );
}

export default function TitleRecommend({ tracks, onSelect }: TitleRecommendProps) {
  const [step, setStep] = useState<Step>("idle");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedTone, setSelectedTone] = useState<TitleTone>("힙한");
  const [results, setResults] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function fetchTitles(category: Category, tone: TitleTone, currentExcluded: string[]) {
    setStep("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/title-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          tone,
          excludedTitles: currentExcluded,
          tracks: tracks.map((track) => ({
            artist: track.artist,
            title: track.title,
          })),
          preferredTitles: readPreferredTitles(),
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { titles?: string[] };
      if (!data.titles?.length) throw new Error("추천 결과가 없습니다");
      setResults(data.titles.map(normalizeTitleText));
      setStep("result");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "알 수 없는 오류");
      setStep("error");
    }
  }

  function handleCategorySelect(cat: Category) {
    setSelectedCategory(cat);
    setExcluded([]);
    setStep("tone");
  }

  function handleToneSelect(tone: TitleTone) {
    if (!selectedCategory) return;
    setSelectedTone(tone);
    fetchTitles(selectedCategory, tone, []);
  }

  function handleRetry() {
    if (!selectedCategory) return;
    const newExcluded = [...excluded, ...results];
    setExcluded(newExcluded);
    fetchTitles(selectedCategory, selectedTone, newExcluded);
  }

  function handleChangeCategory() {
    setStep("category");
    setResults([]);
    setExcluded([]);
    setSelectedCategory(null);
  }

  function handleTitleClick(title: string) {
    savePreferredTitle(title);
    onSelect(title);
    setStep("idle");
    setResults([]);
    setExcluded([]);
    setSelectedCategory(null);
  }

  function handleChangeTone() {
    setStep("tone");
    setResults([]);
  }

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStep("category")}
        className="mt-1 flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
      >
        <span>✦</span>
        <span>제목 추천</span>
      </button>
    );
  }

  if (step === "category") {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-neutral-400">카테고리 선택</p>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORY_KEYS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              className="rounded border border-neutral-600 px-3 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStep("idle")}
          className="mt-1 text-xs text-neutral-500 hover:text-neutral-400"
        >
          취소
        </button>
      </div>
    );
  }

  if (step === "tone") {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-neutral-400">{selectedCategory} · 톤 선택</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TITLE_TONE_KEYS.map((tone) => (
            <button
              key={tone}
              type="button"
              onClick={() => handleToneSelect(tone)}
              className="rounded border border-neutral-600 px-3 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
            >
              {tone}
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={handleChangeCategory}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            ← 카테고리 변경
          </button>
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="text-xs text-neutral-500 hover:text-neutral-400"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
        <span className="animate-spin">○</span>
        <span>제목 생성 중...</span>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-xs text-red-400">오류: {errorMsg}</p>
        <div className="flex gap-2">
          <button type="button" onClick={handleChangeCategory} className="text-xs text-neutral-400 hover:text-neutral-200">
            ← 카테고리 변경
          </button>
          <button type="button" onClick={() => setStep("idle")} className="text-xs text-neutral-500 hover:text-neutral-400">
            닫기
          </button>
        </div>
      </div>
    );
  }

  if (step === "result") {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="mb-0.5 text-xs text-neutral-500">{selectedCategory} · {selectedTone} · 클릭하면 제목으로 적용됩니다</p>
        {results.map((title, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleTitleClick(title)}
            className="w-full rounded border border-neutral-700 px-2.5 py-1.5 text-left text-[var(--vm-text)] transition-colors hover:border-neutral-400 hover:bg-neutral-800"
            style={recommendTitleStyle}
          >
            {title}
          </button>
        ))}
        <div className="mt-1 flex gap-3">
          <button type="button" onClick={handleRetry} className="text-neutral-400 hover:text-neutral-200" style={recommendControlStyle}>
            ↺ 다시 추천
          </button>
          <button type="button" onClick={handleChangeCategory} className="text-neutral-400 hover:text-neutral-200" style={recommendControlStyle}>
            ← 카테고리 변경
          </button>
          <button type="button" onClick={handleChangeTone} className="text-neutral-400 hover:text-neutral-200" style={recommendControlStyle}>
            톤 변경
          </button>
          <button type="button" onClick={() => setStep("idle")} className="text-neutral-500 hover:text-neutral-400" style={recommendControlStyle}>
            닫기
          </button>
        </div>
      </div>
    );
  }

  return null;
}
