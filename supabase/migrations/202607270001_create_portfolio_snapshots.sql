begin;

create table public.portfolio_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (
    jsonb_typeof(state) = 'object'
    and octet_length(state::text) <= 5242880
  ),
  schema_version integer not null default 1 check (schema_version >= 1),
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_snapshots enable row level security;
alter table public.portfolio_snapshots force row level security;

create policy "Users can read their own portfolio snapshot"
  on public.portfolio_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.portfolio_snapshots from public;
revoke all on table public.portfolio_snapshots from anon;
revoke all on table public.portfolio_snapshots from authenticated;
grant select
  on table public.portfolio_snapshots
  to authenticated;

create or replace function public.save_portfolio_snapshot(
  p_user_id uuid,
  p_state jsonb,
  p_schema_version integer,
  p_expected_revision bigint
)
returns table (
  new_revision bigint,
  saved_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if p_user_id is null or p_user_id <> v_user_id then
    raise exception using
      errcode = '42501',
      message = 'portfolio_user_mismatch';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'portfolio_state_must_be_a_json_object';
  end if;

  if octet_length(p_state::text) > 5242880 then
    raise exception using
      errcode = '22001',
      message = 'portfolio_state_too_large';
  end if;

  if p_schema_version is null or p_schema_version < 1 then
    raise exception using
      errcode = '22023',
      message = 'invalid_portfolio_schema_version';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_expected_revision';
  end if;

  if p_expected_revision = 0 then
    return query
      insert into public.portfolio_snapshots as snapshot (
        user_id,
        state,
        schema_version,
        revision,
        updated_at
      )
      values (
        v_user_id,
        p_state,
        p_schema_version,
        1,
        now()
      )
      on conflict (user_id) do nothing
      returning snapshot.revision, snapshot.updated_at;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'portfolio_revision_conflict';
    end if;

    return;
  end if;

  return query
    update public.portfolio_snapshots as snapshot
    set state = p_state,
        schema_version = p_schema_version,
        revision = snapshot.revision + 1,
        updated_at = now()
    where snapshot.user_id = v_user_id
      and snapshot.revision = p_expected_revision
    returning snapshot.revision, snapshot.updated_at;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'portfolio_revision_conflict';
  end if;
end;
$function$;

alter function public.save_portfolio_snapshot(uuid, jsonb, integer, bigint)
  owner to postgres;

revoke all on function public.save_portfolio_snapshot(uuid, jsonb, integer, bigint)
  from public;
revoke all on function public.save_portfolio_snapshot(uuid, jsonb, integer, bigint)
  from anon;
grant execute on function public.save_portfolio_snapshot(uuid, jsonb, integer, bigint)
  to authenticated;

commit;
