create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  snapshot        jsonb not null,
  status          text not null default 'rendering'
                  check (status in ('rendering', 'done', 'error')),
  thumbnail_path  text,
  export_folder   text not null,
  latest_job_id   uuid,
  exported_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_projects_status on public.projects (status);
alter table public.projects disable row level security;
