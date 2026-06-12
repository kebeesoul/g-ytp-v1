-- supabase/migrations/0009_create_youtube_uploads.sql

CREATE TABLE IF NOT EXISTS public.youtube_channels (
  id           TEXT PRIMARY KEY,        -- "hushwav", "bounce-dept" 등 slug
  display_name TEXT NOT NULL,
  token_path   TEXT NOT NULL,           -- token_{id}.json 상대 경로
  authorized   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.youtube_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id       TEXT NOT NULL,
  channel_id      TEXT NOT NULL REFERENCES public.youtube_channels(id),
  youtube_video_id TEXT,
  title           TEXT NOT NULL,
  privacy_status  TEXT NOT NULL DEFAULT 'private',
  upload_status   TEXT NOT NULL DEFAULT 'uploading'
                  CHECK (upload_status IN ('uploading', 'done', 'error')),
  quota_used      INTEGER,
  error_msg       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- 일일 quota 추적
CREATE TABLE IF NOT EXISTS public.youtube_quota_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  quota_used  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date)
);

ALTER TABLE public.youtube_channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_uploads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_quota_log DISABLE ROW LEVEL SECURITY;
