-- Ayni · lógica de negocio en la base de datos (RPC).
-- Todas las funciones son SECURITY DEFINER con search_path fijo y validan auth.uid() y el rol.
-- Los errores "esperados" devuelven jsonb {ok:false, error:'<clave>'}; el cliente los traduce.
-- Las funciones de registro de dinero (record_*) SOLO las puede ejecutar service_role: el backend
-- las llama después de VERIFICAR la transacción en Stellar Testnet.

-- ───────────── utilidades internas ─────────────
create or replace function public._notify(p_user uuid, p_group uuid, p_key text, p_type text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, group_id, key, type, title, body)
  values (p_user, p_group, p_key, p_type, p_title, p_body)
  on conflict (user_id, key) do nothing
$$;

create or replace function public._xlm(p_stroops bigint) returns text
language sql immutable as $$
  select trim(to_char(p_stroops / 10000000.0, 'FM999,999,990.00')) || ' XLM'
$$;

create or replace function public._renumber(p_group uuid) returns void
language sql security definer set search_path = public as $$
  with r as (
    select user_id, row_number() over (order by position, joined_at) - 1 as rn
    from public.group_members where group_id = p_group
  )
  update public.group_members m set position = r.rn from r
  where m.group_id = p_group and m.user_id = r.user_id
$$;

create or replace function public._err(p_key text) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'error', p_key) $$;

-- ───────────── crear grupo ─────────────
-- p = {kind:'junta'|'promocion'|'pandero', name, capacity, nature?, goal_stroops?, due_date?, release_date?,
--      rule?, cuota_stroops?, visibility?}
create or replace function public.create_group(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  k text := p ->> 'kind';
  nm text := btrim(coalesce(p ->> 'name', ''));
  cap int := (p ->> 'capacity')::int;
  c text;
  gid uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if k not in ('junta', 'promocion', 'pandero') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if char_length(nm) not between 1 and 60 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if k = 'pandero' and cap not between 2 and 50 then raise exception 'invalid_capacity' using errcode = '22023'; end if;
  if k <> 'pandero' and cap not between 2 and 200 then raise exception 'invalid_capacity' using errcode = '22023'; end if;

  loop
    c := public.gen_code('AYNI-');
    exit when not exists (select 1 from public.groups where code = c);
  end loop;

  if k = 'pandero' then
    insert into public.groups (kind, name, code, capacity, creator_id, cuota_stroops, visibility, phase)
    values ('pandero', nm, case when p ->> 'visibility' = 'privado' then c end, cap, uid,
            (p ->> 'cuota_stroops')::bigint, p ->> 'visibility', 'reclutando')
    returning id into gid;
    -- el creador entra como participante común: SIN privilegios (ver trigger no_pandero_treasurer)
    insert into public.group_members (group_id, user_id, role, position) values (gid, uid, 'member', 0);
  else
    insert into public.groups (kind, name, code, capacity, creator_id, nature, goal_stroops, due_date, release_date, rule, status)
    values (k, nm, c, cap, uid, p ->> 'nature', (p ->> 'goal_stroops')::bigint, (p ->> 'due_date')::date,
            coalesce((p ->> 'release_date')::date, (p ->> 'due_date')::date), coalesce(p ->> 'rule', 'fecha'), 'custodia')
    returning id into gid;
    insert into public.group_members (group_id, user_id, role, position) values (gid, uid, 'treasurer', 0);
  end if;
  return gid;
end $$;

-- ───────────── unirse por código (sin enumerar grupos privados) ─────────────
create or replace function public.join_group_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  g public.groups;
  n int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if length(c) <> 9 then return public._err('code_length'); end if;
  if c !~ '^AYNI-[A-Z0-9]{4}$' then return public._err('code_format'); end if;

  -- anti fuerza bruta: máx. 20 códigos inexistentes cada 10 minutos por usuario
  select count(*) into n from public.code_attempts where user_id = uid and at > now() - interval '10 minutes';
  if n >= 20 then return public._err('rate_limited'); end if;

  select * into g from public.groups where code = c for update;
  if not found or g.archived then
    insert into public.code_attempts (user_id) values (uid);
    delete from public.code_attempts where at < now() - interval '1 day'; -- mantenimiento barato
    return public._err('not_found');
  end if;

  if exists (select 1 from public.group_members where group_id = g.id and user_id = uid) then
    return jsonb_build_object('ok', true, 'result', 'already', 'group_id', g.id);
  end if;

  if g.kind = 'pandero' then
    if g.phase <> 'reclutando' then return public._err('pandero_full'); end if;
    -- los términos se aceptan en la UI y luego se llama a join_pandero(id, code).
    -- Se devuelve solo lo necesario para mostrar los términos (el grupo privado no es legible por RLS).
    return jsonb_build_object('ok', true, 'result', 'needs_terms', 'group_id', g.id,
      'name', g.name, 'cuota_stroops', g.cuota_stroops, 'capacity', g.capacity, 'visibility', g.visibility);
  end if;

  if not g.admissions_open then return public._err('admissions_closed'); end if;
  select count(*) into n from public.group_members where group_id = g.id;
  if n >= g.capacity then return public._err('group_full'); end if;

  insert into public.group_members (group_id, user_id, role, position) values (g.id, uid, 'member', n);
  if n + 1 >= g.capacity then
    perform public._notify(g.creator_id, g.id, 'full-' || g.id || '-' || g.capacity, 'full',
      g.name || ' llegó a su capacidad máxima', (n + 1) || ' de ' || g.capacity || ' miembros. Nadie más puede unirse con el código salvo que agregues un cupo.');
  end if;
  return jsonb_build_object('ok', true, 'result', 'joined', 'group_id', g.id);
end $$;

-- Unirse a un pandero tras aceptar los términos. Los privados exigen el código.
create or replace function public.join_pandero(p_group uuid, p_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  n int;
  m record;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into g from public.groups where id = p_group and kind = 'pandero' for update;
  if not found or g.archived then return public._err('not_found'); end if;
  if g.visibility = 'privado' and coalesce(upper(p_code), '') <> g.code then
    insert into public.code_attempts (user_id) values (uid);
    return public._err('not_found');
  end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = uid) then
    return jsonb_build_object('ok', true, 'result', 'already', 'group_id', g.id);
  end if;
  if g.phase <> 'reclutando' then return public._err('pandero_full'); end if;
  select count(*) into n from public.group_members where group_id = g.id;
  if n >= g.capacity then return public._err('pandero_full'); end if;

  insert into public.group_members (group_id, user_id, role, position) values (g.id, uid, 'member', n);
  if n + 1 >= g.capacity then
    update public.groups set phase = 'espera', start_date = current_date + 30 where id = g.id;
    for m in select user_id from public.group_members where group_id = g.id loop
      perform public._notify(m.user_id, g.id, 'full-' || g.id, 'full', 'Se completó ' || g.name,
        'Llegaron los ' || g.capacity || ' participantes y se cerró el ingreso. El juego empieza el ' || to_char(current_date + 30, 'DD/MM/YYYY') || '.');
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'result', 'joined', 'group_id', g.id);
end $$;

-- ───────────── administración (solo tesorero de un fondo común) ─────────────
create or replace function public.set_admissions(p_group uuid, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_treasurer(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.groups set admissions_open = p_open where id = p_group and kind <> 'pandero';
end $$;

create or replace function public.add_member_by_user_code(p_group uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  u public.profiles;
  c text := upper(btrim(coalesce(p_code, '')));
  n int;
begin
  if not public.is_group_treasurer(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c ~ '^[A-Z0-9]{4}$' then c := 'USR-' || c; end if;
  select * into g from public.groups where id = p_group for update;
  select * into u from public.profiles where user_code = c;
  if u.id = uid then return public._err('own_code'); end if;
  if not found then return public._err('no_user'); end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = u.id) then
    return jsonb_build_object('ok', false, 'error', 'already_member', 'name', u.name);
  end if;
  select count(*) into n from public.group_members where group_id = p_group;
  if n < g.capacity then
    insert into public.group_members (group_id, user_id, role, position) values (p_group, u.id, 'member', n);
    return jsonb_build_object('ok', true, 'result', 'added', 'user_id', u.id, 'name', u.name);
  end if;
  return jsonb_build_object('ok', true, 'result', 'needs_recalc', 'user_id', u.id, 'name', u.name);
end $$;

-- Cambia monto / quita o agrega miembros y recalcula cuotas con devoluciones automáticas (ledger).
create or replace function public.apply_change(
  p_group uuid, p_goal bigint default null, p_remove uuid default null, p_cap_delta int default 0, p_add uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  new_goal bigint;
  new_cap int;
  c_new bigint;
  cnt int;
  rm record;
  m record;
  refund bigint;
  stamp text := extract(epoch from clock_timestamp())::bigint::text;
begin
  if not public.is_group_treasurer(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.groups where id = p_group for update;
  if g.status <> 'custodia' then return public._err('not_in_custody'); end if;

  new_goal := coalesce(p_goal, g.goal_stroops);
  if new_goal <= 0 then return public._err('invalid_goal'); end if;

  if p_remove is not null then
    if p_remove = uid then return public._err('cannot_remove_self'); end if;
    select gm.paid_stroops, pr.name into rm
      from public.group_members gm join public.profiles pr on pr.id = gm.user_id
      where gm.group_id = p_group and gm.user_id = p_remove;
    if not found then return public._err('not_member'); end if;
    if rm.paid_stroops > 0 then
      insert into public.ledger_entries (group_id, direction, amount_stroops, description, method, actor_id)
      values (p_group, 'out', rm.paid_stroops, 'Devolución a ' || rm.name || ' (eliminado)', 'Devolución automática', uid);
      perform public._notify(p_remove, p_group, 'removed-' || p_group || '-' || stamp, 'refund',
        'Te quitaron de ' || g.name, 'Se te devolvieron ' || public._xlm(rm.paid_stroops) || '.');
    end if;
    delete from public.group_members where group_id = p_group and user_id = p_remove;
    perform public._renumber(p_group);
  end if;

  select count(*) into cnt from public.group_members where group_id = p_group;
  if p_add is not null then
    if exists (select 1 from public.group_members where group_id = p_group and user_id = p_add) then
      return public._err('already_member');
    end if;
    cnt := cnt + 1;
  end if;
  new_cap := g.capacity + coalesce(p_cap_delta, 0);
  if new_cap < 2 or new_cap < cnt or new_cap > 200 then return public._err('capacity_invalid'); end if;

  update public.groups set goal_stroops = new_goal, capacity = new_cap where id = p_group;
  c_new := public.fund_cuota(new_goal, new_cap);

  for m in
    select gm.user_id, gm.paid_stroops, pr.name
    from public.group_members gm join public.profiles pr on pr.id = gm.user_id where gm.group_id = p_group
  loop
    if m.paid_stroops > c_new then
      refund := m.paid_stroops - c_new;
      update public.group_members set paid_stroops = c_new where group_id = p_group and user_id = m.user_id;
      insert into public.ledger_entries (group_id, direction, amount_stroops, description, method, actor_id)
      values (p_group, 'out', refund, 'Devolución a ' || m.name, 'Devolución automática', uid);
      perform public._notify(m.user_id, p_group, 'refund-' || p_group || '-' || stamp, 'refund',
        'Recibiste una devolución de ' || public._xlm(refund),
        'La cuota de ' || g.name || ' bajó a ' || public._xlm(c_new) || '. Te devolvimos la diferencia.');
    elsif m.paid_stroops > 0 and m.paid_stroops < c_new then
      perform public._notify(m.user_id, p_group, 'owe-' || p_group || '-' || stamp, 'owe',
        'Tu cuota en ' || g.name || ' cambió',
        'Ahora es ' || public._xlm(c_new) || '. Ya abonaste ' || public._xlm(m.paid_stroops) || '; te falta ' || public._xlm(c_new - m.paid_stroops) || '.');
    end if;
  end loop;

  if p_add is not null then
    insert into public.group_members (group_id, user_id, role, position) values (p_group, p_add, 'member', cnt - 1);
  end if;
  perform public.refresh_group_status(p_group);
  return jsonb_build_object('ok', true);
end $$;

-- ───────────── cierre de la recolección ─────────────
-- Idempotente. Pasa a 'listo' cuando se cumple la fecha (o dateReached) o, con regla 'meta', todos pagaron.
create or replace function public.refresh_group_status(p_group uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  total bigint;
  paid_all boolean;
  n int;
  cuota bigint;
  met boolean;
  m record;
begin
  select * into g from public.groups where id = p_group for update;
  if not found or g.kind = 'pandero' or g.status <> 'custodia' then return g.status; end if;
  -- solo miembros (o el backend) pueden pedir la reevaluación
  if auth.uid() is not null and not public.is_group_member(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;

  cuota := public.fund_cuota(g.goal_stroops, g.capacity);
  select count(*), coalesce(sum(paid_stroops), 0), coalesce(bool_and(paid_stroops >= cuota), false)
    into n, total, paid_all from public.group_members where group_id = p_group;
  if g.rule = 'meta' then met := (n = g.capacity and paid_all);
  else met := (current_date >= g.release_date or g.date_reached);
  end if;

  if met then
    update public.groups set status = 'listo', ready_at = now() where id = p_group;
    for m in select user_id, role from public.group_members where group_id = p_group loop
      perform public._notify(m.user_id, p_group, 'ready-' || p_group, 'closed', 'Cerró la recolección de ' || g.name,
        case when m.role = 'treasurer'
          then 'Se reunieron ' || public._xlm(total) || '. Como tesorero, recolecta el monto en tu wallet o envíalo a un participante.'
          else 'Se reunieron ' || public._xlm(total) || '. El tesorero decidirá el destino del fondo.' end);
    end loop;
    return 'listo';
  end if;
  return g.status;
end $$;

create or replace function public.archive_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where id = p_group for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if g.kind = 'pandero' then
    -- quien creó el pandero puede archivarlo (acción no financiera) cuando terminó
    if g.creator_id <> auth.uid() or g.phase <> 'terminado' then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    if not public.is_group_treasurer(p_group) or g.status <> 'liberado' then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  update public.groups set archived = true, archived_at = now() where id = p_group;
end $$;

create or replace function public.new_cycle(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_treasurer(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.groups set status = 'custodia', date_reached = false, ready_at = null, released_at = null,
    released_amount_stroops = null, released_to = null, released_tx_hash = null,
    due_date = current_date + 7, release_date = current_date + 30
  where id = p_group and status = 'liberado';
  update public.group_members set paid_stroops = 0, paid_at = null, reminders = 0 where group_id = p_group;
end $$;

-- ───────────── foro público (sin exponer panderos privados ni sus miembros) ─────────────
create or replace function public.list_public_panderos()
returns table (id uuid, name text, cuota_stroops bigint, capacity int, phase text, round int, start_date date,
               created_at timestamptz, creator_name text, member_count int, is_member boolean)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.cuota_stroops, g.capacity, g.phase, g.round, g.start_date, g.created_at, p.name,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
  from public.groups g join public.profiles p on p.id = g.creator_id
  where g.kind = 'pandero' and g.visibility = 'publico' and not g.archived
  order by g.created_at desc
$$;

-- ───────────── SOLO BACKEND (service_role): registro de dinero verificado en Stellar ─────────────
create or replace function public.contribution_due(p_group uuid, p_user uuid) returns bigint
language sql security definer stable set search_path = public as $$
  select greatest(0, public.fund_cuota(g.goal_stroops, g.capacity) - m.paid_stroops)
  from public.groups g join public.group_members m on m.group_id = g.id
  where g.id = p_group and m.user_id = p_user and g.kind <> 'pandero' and g.status = 'custodia'
$$;

create or replace function public.record_contribution(
  p_group uuid, p_user uuid, p_amount bigint, p_tx_hash text, p_idem text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  m public.group_members;
  owed bigint;
  cid uuid;
  nm text;
begin
  -- reintento tras un corte de red: el mismo hash del mismo usuario/grupo ya está registrado → éxito idempotente
  if exists (select 1 from public.contributions where stellar_tx_hash = p_tx_hash and user_id = p_user and group_id = p_group) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select * into g from public.groups where id = p_group for update;
  if not found then return public._err('not_found'); end if;
  if g.kind = 'pandero' then return public._err('unsupported_kind'); end if;
  if g.status <> 'custodia' then return public._err('not_in_custody'); end if;
  select * into m from public.group_members where group_id = p_group and user_id = p_user for update;
  if not found then return public._err('not_member'); end if;

  owed := greatest(0, public.fund_cuota(g.goal_stroops, g.capacity) - m.paid_stroops);
  if owed = 0 then return public._err('nothing_due'); end if;
  if p_amount <> owed then return public._err('wrong_amount'); end if;

  begin
    insert into public.contributions (group_id, user_id, amount_stroops, stellar_tx_hash, idempotency_key, status, confirmed_at)
    values (p_group, p_user, p_amount, p_tx_hash, p_idem, 'confirmed', now())
    returning id into cid;
  exception when unique_violation then
    -- doble clic / reintento con la misma transacción: idempotente. Otro grupo/usuario: hash reutilizado.
    if exists (select 1 from public.contributions
               where stellar_tx_hash = p_tx_hash and user_id = p_user and group_id = p_group) then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
    return public._err('hash_already_used');
  end;

  update public.group_members set paid_stroops = paid_stroops + p_amount, paid_at = now()
  where group_id = p_group and user_id = p_user;
  select name into nm from public.profiles where id = p_user;
  insert into public.ledger_entries (group_id, direction, amount_stroops, description, method, tx_hash, actor_id, contribution_id)
  values (p_group, 'in', p_amount, 'Cuota de ' || nm, 'Stellar Testnet', p_tx_hash, p_user, cid);
  perform public._notify(p_user, p_group, 'paid-' || p_tx_hash, 'debit', 'Pago registrado',
    'Tu cuota de ' || public._xlm(p_amount) || ' en ' || g.name || ' quedó registrada en Stellar Testnet.');
  perform public.refresh_group_status(p_group);
  return jsonb_build_object('ok', true, 'contribution_id', cid);
end $$;

-- Candado de disposición: el backend lo toma ANTES de enviar XLM desde la treasury; así dos peticiones
-- simultáneas (doble clic, reintento) no pueden enviar el fondo dos veces. Caduca a los 2 minutos.
create or replace function public.begin_disposal(p_group uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where id = p_group for update;
  if not found or g.kind = 'pandero' then return public._err('not_found'); end if;
  if g.status <> 'listo' then return public._err('not_ready'); end if;
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = p_actor and role = 'treasurer') then
    return public._err('forbidden');
  end if;
  if g.disposal_lock_at is not null and g.disposal_lock_at > now() - interval '2 minutes' then
    return public._err('in_progress');
  end if;
  update public.groups set disposal_lock_at = now() where id = p_group;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.abort_disposal(p_group uuid) returns void
language sql security definer set search_path = public as $$
  update public.groups set disposal_lock_at = null where id = p_group and status = 'listo'
$$;

create or replace function public.record_disposal(
  p_group uuid, p_actor uuid, p_to uuid, p_amount bigint, p_tx_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  total bigint;
  to_name text;
  m record;
begin
  select * into g from public.groups where id = p_group for update;
  if not found or g.kind = 'pandero' then return public._err('not_found'); end if;
  -- solo se puede disponer cuando la recolección cerró ('listo') y por el tesorero
  if g.status <> 'listo' then return public._err('not_ready'); end if;
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = p_actor and role = 'treasurer') then
    return public._err('forbidden');
  end if;
  select name into to_name from public.profiles p join public.group_members gm on gm.user_id = p.id
    where gm.group_id = p_group and gm.user_id = p_to;
  if to_name is null then return public._err('not_member'); end if;
  select coalesce(sum(paid_stroops), 0) into total from public.group_members where group_id = p_group;
  if p_amount <> total then return public._err('wrong_amount'); end if;

  begin
    insert into public.ledger_entries (group_id, direction, amount_stroops, description, method, tx_hash, actor_id)
    values (p_group, 'out', total,
            case when p_to = g.creator_id then 'Recolectado por el tesorero (' || to_name || ')' else 'Entregado a ' || to_name end,
            'Disposición del tesorero', p_tx_hash, p_actor);
  exception when unique_violation then
    return public._err('hash_already_used');
  end;

  update public.groups set status = 'liberado', released_at = now(), released_amount_stroops = total,
    released_to = p_to, released_tx_hash = p_tx_hash, disposal_lock_at = null where id = p_group;
  for m in select user_id from public.group_members where group_id = p_group loop
    perform public._notify(m.user_id, p_group, 'released-' || p_group, 'closed', 'Fondo de ' || g.name || ' entregado',
      'Se enviaron ' || public._xlm(total) || ' a ' || to_name || '. El proceso terminó.');
  end loop;
  return jsonb_build_object('ok', true, 'amount', total);
end $$;

-- ───────────── permisos de ejecución ─────────────
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.create_group(jsonb), public.join_group_by_code(text), public.join_pandero(uuid, text),
  public.set_admissions(uuid, boolean), public.add_member_by_user_code(uuid, text),
  public.apply_change(uuid, bigint, uuid, int, uuid), public.refresh_group_status(uuid),
  public.archive_group(uuid), public.new_cycle(uuid), public.list_public_panderos()
to authenticated;

-- las políticas RLS se evalúan con el rol del usuario y necesitan estas funciones
grant execute on function public.is_group_member(uuid), public.is_group_treasurer(uuid), public.shares_group_with(uuid)
to authenticated;

grant execute on function
  public.contribution_due(uuid, uuid), public.record_contribution(uuid, uuid, bigint, text, text),
  public.record_disposal(uuid, uuid, uuid, bigint, text), public.refresh_group_status(uuid),
  public.begin_disposal(uuid, uuid), public.abort_disposal(uuid)
to service_role;
