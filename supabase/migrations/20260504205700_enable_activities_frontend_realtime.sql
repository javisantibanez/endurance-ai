alter table public.activities enable row level security;

drop policy if exists "Allow frontend read access to activities" on public.activities;

create policy "Allow frontend read access to activities"
on public.activities
for select
to anon, authenticated
using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activities'
  ) then
    alter publication supabase_realtime add table public.activities;
  end if;
end $$;
