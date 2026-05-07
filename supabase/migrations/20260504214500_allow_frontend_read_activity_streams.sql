do $$
begin
  if to_regclass('public.activity_streams') is not null then
    execute 'alter table public.activity_streams enable row level security';
    execute 'grant select on table public.activity_streams to anon, authenticated';
    execute 'drop policy if exists "Allow frontend read access to activity streams" on public.activity_streams';
    execute 'create policy "Allow frontend read access to activity streams"
      on public.activity_streams
      for select
      to anon, authenticated
      using (true)';
  end if;
end $$;
