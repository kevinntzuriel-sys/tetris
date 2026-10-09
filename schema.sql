create table if not exists public.scores (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  username   text        not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  score      integer     not null default 0 check (score >= 0 and score <= 99999999),
  created_at timestamptz not null default now()
);

create index if not exists scores_ranking_idx
  on public.scores (score desc, created_at asc);

alter table public.scores enable row level security;

drop policy if exists "scores_select_public" on public.scores;
drop policy if exists "scores_insert_own"    on public.scores;
drop policy if exists "scores_update_own"    on public.scores;

create policy "scores_select_public"
  on public.scores
  for select
  to anon, authenticated
  using (true);

create policy "scores_insert_own"
  on public.scores
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "scores_update_own"
  on public.scores
  for update
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.scores from anon, authenticated;
grant select                  on public.scores to anon, authenticated;
grant insert, update          on public.scores to authenticated;

create or replace function public.scores_keep_best()
returns trigger
language plpgsql
as $$
begin
  new.id      := old.id;
  new.user_id := old.user_id;

  if new.score > old.score then
    new.created_at := now();
  else
    new.score      := old.score;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists scores_keep_best_trg on public.scores;
create trigger scores_keep_best_trg
  before update on public.scores
  for each row
  execute function public.scores_keep_best();
