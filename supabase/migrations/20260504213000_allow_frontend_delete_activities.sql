grant delete on table public.activities to anon, authenticated;

drop policy if exists "Allow frontend delete access to activities" on public.activities;

create policy "Allow frontend delete access to activities"
on public.activities
for delete
to anon, authenticated
using (true);

do $$
begin
  if to_regclass('public.activity_streams') is not null then
    execute 'grant delete on table public.activity_streams to anon, authenticated';
    execute 'drop policy if exists "Allow frontend delete access to activity streams" on public.activity_streams';
    execute 'create policy "Allow frontend delete access to activity streams"
      on public.activity_streams
      for delete
      to anon, authenticated
      using (true)';
  end if;
end $$;
