create table public.render_jobs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  status        text not null check (status in ('queued','running','done','error')),
  progress      numeric(4,3) default 0,
  eta_sec       integer,
  output_path   text,
  error_msg     text,
  started_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  completed_at  timestamptz
);
create index idx_render_jobs_project on public.render_jobs (project_id);
create index idx_render_jobs_status on public.render_jobs (status);
alter table public.render_jobs disable row level security;
