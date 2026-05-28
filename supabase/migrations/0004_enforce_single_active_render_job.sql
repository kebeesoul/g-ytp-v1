-- Enforce at most one active render job at the DB level.
-- Application-level check in render/route.ts can race under concurrent requests;
-- this partial unique index makes the constraint atomic.
create unique index idx_render_jobs_single_active
  on public.render_jobs ((true))
  where status in ('queued', 'running');
