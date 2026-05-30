create table public.thumbnail_presets (
  id           uuid primary key default gen_random_uuid(),
  slot_index   smallint not null check (slot_index >= 0 and slot_index <= 5),
  name         text not null default 'Preset',

  font_id      text not null default 'bagnard',
  overlay_id   text not null default 'none',
  position_id  text not null default 'bottom',
  color_id     text not null default 'white',
  text         text not null default 'PLAYLIST',
  text_case_id text not null default 'upper',
  text_size_px smallint not null default 148 check (text_size_px >= 50 and text_size_px <= 280),
  letter_spacing_px smallint not null default 0 check (letter_spacing_px >= -20 and letter_spacing_px <= 80),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique(slot_index)
);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger thumbnail_presets_updated_at
  before update on public.thumbnail_presets
  for each row execute function update_updated_at();

create index idx_thumbnail_presets_slot on public.thumbnail_presets(slot_index);

alter table public.thumbnail_presets disable row level security;
