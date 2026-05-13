alter table public.render_jobs
  add constraint fk_render_jobs_project
  foreign key (project_id) references public.projects(id);

alter table public.projects
  add constraint fk_projects_latest_job
  foreign key (latest_job_id) references public.render_jobs(id)
  deferrable initially deferred;
