create table if not exists public.dayora_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  type text not null default 'in-person' check (type in ('in-person', 'online', 'uploaded')),
  attendees jsonb not null default '[]'::jsonb check (jsonb_typeof(attendees) = 'array'),
  agenda text not null default '',
  notes text not null default '',
  project_id uuid,
  meeting_at bigint,
  transcript text not null default '',
  transcript_segments jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript_segments) = 'array'),
  transcript_language text not null default '',
  minutes jsonb,
  status text not null default 'scheduled' check (status in ('scheduled', 'recording', 'processing', 'completed', 'failed')),
  started_at bigint,
  ended_at bigint,
  timer_elapsed_ms bigint not null default 0 check (timer_elapsed_ms >= 0),
  timer_state text not null default 'idle' check (timer_state in ('idle', 'running', 'paused', 'stopped')),
  processing_error text not null default '',
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  constraint dayora_meetings_workspace_owner_check check (workspace_id = user_id)
);

create index if not exists dayora_meetings_user_updated_idx on public.dayora_meetings (user_id, updated_at desc);
create index if not exists dayora_meetings_user_meeting_at_idx on public.dayora_meetings (user_id, meeting_at desc);
create index if not exists dayora_meetings_user_status_idx on public.dayora_meetings (user_id, status);

alter table public.dayora_meetings enable row level security;
grant select, insert, update, delete on public.dayora_meetings to authenticated;

create policy "Users can read their own meetings"
  on public.dayora_meetings for select to authenticated
  using ((select auth.uid()) = user_id and (select auth.uid()) = workspace_id);
create policy "Users can create their own meetings"
  on public.dayora_meetings for insert to authenticated
  with check ((select auth.uid()) = user_id and (select auth.uid()) = workspace_id);
create policy "Users can update their own meetings"
  on public.dayora_meetings for update to authenticated
  using ((select auth.uid()) = user_id and (select auth.uid()) = workspace_id)
  with check ((select auth.uid()) = user_id and (select auth.uid()) = workspace_id);
create policy "Users can delete their own meetings"
  on public.dayora_meetings for delete to authenticated
  using ((select auth.uid()) = user_id and (select auth.uid()) = workspace_id);
