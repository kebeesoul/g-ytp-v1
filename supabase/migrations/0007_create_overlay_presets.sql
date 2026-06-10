-- supabase/migrations/0007_create_overlay_presets.sql
-- 운영 DB(vpxnnmxaiulopiyxdqqq) 실제 스키마 기준으로 작성
-- 확인일: 2026-06-10

CREATE TABLE IF NOT EXISTS public.overlay_presets (
  -- identity
  id            TEXT PRIMARY KEY,
  slot_index    INTEGER NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 1,

  -- renderer
  renderer      TEXT NOT NULL DEFAULT 'drawtext',

  -- layout
  anchor        TEXT NOT NULL DEFAULT 'bottom-left',
  offset_x      INTEGER NOT NULL DEFAULT 80,
  offset_y      INTEGER NOT NULL DEFAULT -160,
  safe_margin_x INTEGER NOT NULL DEFAULT 96,
  safe_margin_y INTEGER NOT NULL DEFAULT 72,

  -- typography
  artist_font_family  TEXT NOT NULL DEFAULT 'AppleSDGothicNeo',
  artist_font_size    INTEGER NOT NULL DEFAULT 32,
  artist_weight       INTEGER NOT NULL DEFAULT 500,
  title_font_family   TEXT NOT NULL DEFAULT 'AppleSDGothicNeo',
  title_font_size     INTEGER NOT NULL DEFAULT 42,
  title_weight        INTEGER NOT NULL DEFAULT 700,
  text_align          TEXT NOT NULL DEFAULT 'left',
  line_height         REAL NOT NULL DEFAULT 1.15,
  letter_spacing      INTEGER NOT NULL DEFAULT 0,
  max_lines_title     INTEGER NOT NULL DEFAULT 2,

  -- color
  color_artist        TEXT NOT NULL DEFAULT '#FFFFFF',
  color_title         TEXT NOT NULL DEFAULT '#FFFFFF',
  color_bg            TEXT,
  color_shadow        TEXT,

  -- card
  card_enabled        BOOLEAN NOT NULL DEFAULT false,
  card_padding_x      INTEGER NOT NULL DEFAULT 32,
  card_padding_y      INTEGER NOT NULL DEFAULT 24,
  card_radius         INTEGER NOT NULL DEFAULT 24,
  card_blur           INTEGER NOT NULL DEFAULT 0,
  card_opacity        REAL NOT NULL DEFAULT 1.0,

  -- animation
  fade_in_sec         REAL NOT NULL DEFAULT 0.3,
  fade_out_sec        REAL NOT NULL DEFAULT 0.5,
  anim_memo           TEXT,

  -- timestamps
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- constraints
  UNIQUE (slot_index)
);

ALTER TABLE public.overlay_presets DISABLE ROW LEVEL SECURITY;
