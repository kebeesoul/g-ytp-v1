-- supabase/migrations/0008_add_render_telemetry.sql

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS render_duration_sec  INTEGER,
  ADD COLUMN IF NOT EXISTS audio_duration_sec   NUMERIC,
  ADD COLUMN IF NOT EXISTS encoder              TEXT,
  ADD COLUMN IF NOT EXISTS output_size_bytes    BIGINT,
  ADD COLUMN IF NOT EXISTS cache_hit            BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.render_jobs.render_duration_sec  IS '렌더 시작부터 done까지 전체 소요 초';
COMMENT ON COLUMN public.render_jobs.audio_duration_sec   IS '최종 영상의 오디오 총 길이(초)';
COMMENT ON COLUMN public.render_jobs.encoder              IS 'hevc_videotoolbox 또는 libx264';
COMMENT ON COLUMN public.render_jobs.output_size_bytes    IS '최종 mp4 파일 크기(bytes)';
COMMENT ON COLUMN public.render_jobs.cache_hit            IS 'mastered-cache 에서 트랙 하나 이상 재사용 여부';
