-- Ayni · Row Level Security
-- Principio: los clientes (anon/authenticated) SOLO leen lo que les corresponde y solo editan sus
-- datos personales. Toda mutación de grupos, miembros, montos y ledger ocurre en funciones
-- SECURITY DEFINER que comprueban el rol (tesorero/participante) en la base de datos, de modo que
-- ocultar botones en el frontend NO es la única defensa.

-- ───────────── funciones auxiliares (SECURITY DEFINER para evitar recursión de RLS) ─────────────
create or replace function public.is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
$$;

create or replace function public.is_group_treasurer(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members m join public.groups g on g.id = m.group_id
    where m.group_id = gid and m.user_id = auth.uid() and m.role = 'treasurer' and g.kind <> 'pandero'
  )
$$;

create or replace function public.shares_group_with(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ───────────── habilitar RLS en TODAS las tablas ─────────────
alter table public.profiles              enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.wallet_accounts       enable row level security;
alter table public.contributions         enable row level security;
alter table public.ledger_entries        enable row level security;
alter table public.notifications         enable row level security;
alter table public.pandero_turns         enable row level security;
alter table public.pandero_rounds        enable row level security;
alter table public.pandero_contributions enable row level security;
alter table public.code_attempts         enable row level security; -- sin políticas: inaccesible para clientes

-- ───────────── privilegios mínimos ─────────────
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles, public.groups, public.group_members, public.contributions,
  public.ledger_entries, public.notifications, public.pandero_turns, public.pandero_rounds,
  public.pandero_contributions to authenticated;
grant select, insert, update, delete on public.wallet_accounts to authenticated;
-- perfil: solo columnas personales (user_code, id y created_at son inmutables para el cliente)
grant update (name, email, phone, address) on public.profiles to authenticated;
-- notificaciones: el usuario solo puede marcar como leída
grant update (read) on public.notifications to authenticated;

-- ───────────── políticas ─────────────
-- Perfil: cada usuario lee y edita el suyo; puede ver a quienes comparten un grupo con él.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Grupos: los miembros leen sus grupos; los panderos PÚBLICOS son visibles para el foro.
-- Los privados nunca se pueden enumerar: solo se entra con código vía join_group_by_code().
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id) or (kind = 'pandero' and visibility = 'publico' and not archived));
-- (sin políticas de INSERT/UPDATE/DELETE: solo las funciones SECURITY DEFINER escriben)

create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- Wallet: metadatos propios (dirección pública). Nunca claves.
create policy wallet_select_own on public.wallet_accounts for select to authenticated using (user_id = auth.uid());
create policy wallet_insert_own on public.wallet_accounts for insert to authenticated with check (user_id = auth.uid());
create policy wallet_update_own on public.wallet_accounts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wallet_delete_own on public.wallet_accounts for delete to authenticated using (user_id = auth.uid());

-- Contribuciones: las ve quien paga y el tesorero. Solo service_role (backend verificado) las crea.
create policy contributions_select on public.contributions for select to authenticated
  using (user_id = auth.uid() or public.is_group_treasurer(group_id));

-- Registro transparente: visible para todos los miembros del grupo.
create policy ledger_select on public.ledger_entries for select to authenticated
  using (public.is_group_member(group_id));

-- Notificaciones: solo las propias.
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pandero (rondas): lectura para miembros.
create policy pandero_turns_select on public.pandero_turns for select to authenticated using (public.is_group_member(group_id));
create policy pandero_rounds_select on public.pandero_rounds for select to authenticated using (public.is_group_member(group_id));
create policy pandero_contrib_select on public.pandero_contributions for select to authenticated using (public.is_group_member(group_id));

-- El backend (service_role) omite RLS por diseño de Supabase; aun así, concedemos lo necesario.
grant all on all tables in schema public to service_role;
