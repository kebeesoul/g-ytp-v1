-- supabase/migrations/0010_create_ytmp3.sql

CREATE TABLE IF NOT EXISTS public.ytmp3_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url    TEXT NOT NULL,
  url_type      TEXT NOT NULL CHECK (url_type IN ('single', 'playlist')),
  status        TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'extracting', 'done', 'error')),
  total_count   INTEGER DEFAULT 0,
  done_count    INTEGER DEFAULT 0,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ytmp3_tracks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES public.ytmp3_jobs(id) ON DELETE CASCADE,
  youtube_id    TEXT NOT NULL,
  artist        TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  duration_sec  NUMERIC,
  local_path    TEXT NOT NULL,            -- workspace/ytmp3/{trackId}.mp3
  added_to_editor BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ytmp3_tracks_job ON public.ytmp3_tracks(job_id);

ALTER TABLE public.ytmp3_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytmp3_tracks DISABLE ROW LEVEL SECURITY;
