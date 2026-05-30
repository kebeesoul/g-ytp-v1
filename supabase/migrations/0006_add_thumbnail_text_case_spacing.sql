alter table public.thumbnail_presets
  add column if not exists text_case_id text not null default 'upper',
  add column if not exists letter_spacing_px smallint not null default 0;

alter table public.thumbnail_presets
  drop constraint if exists thumbnail_presets_letter_spacing_px_check;

alter table public.thumbnail_presets
  add constraint thumbnail_presets_letter_spacing_px_check
  check (letter_spacing_px >= -20 and letter_spacing_px <= 80);
