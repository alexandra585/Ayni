-- Ayni · esquema base (MVP hackathon · Stellar TESTNET ONLY)
-- Convenciones:
--   · Dinero SIEMPRE en enteros (stroops): 1 XLM = 10,000,000 stroops. Nunca numeric/float.
--   · Toda escritura crítica pasa por funciones SECURITY DEFINER (ver 0003) que validan roles;
--     los clientes solo tienen SELECT (y UPDATE de columnas propias) gracias a RLS (ver 0002).

-- ───────────────────────────── utilidades ─────────────────────────────
-- Código corto AYNI-XXXX / USR-XXXX. Usa gen_random_uuid() (incluido en PostgreSQL ≥ 13, CSPRNG)
-- para no depender de pgcrypto ni del search_path de las extensiones.
create or replace function public.gen_code(prefix text) returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  s text := '';
  i int;
begin
  for i in 0..3 loop
    s := s || substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1);
  end loop;
  return prefix || s;
end $$;

-- Cuota de un fondo común = meta / cupos, redondeada a 0.01 XLM (100,000 stroops).
create or replace function public.fund_cuota(goal_stroops bigint, cap int) returns bigint
language sql immutable as $$
  select (round(goal_stroops::numeric / cap / 100000) * 100000)::bigint
$$;

-- ───────────────────────────── perfiles ─────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 60),
  email       text not null default '',
  phone       text not null default '' check (phone ~ '^[0-9 +]{0,15}$'),
  address     text not null default '' check (char_length(address) <= 100),
  user_code   text not null unique default public.gen_code('USR-') check (user_code ~ '^USR-[A-Z0-9]{4}$'),
  created_at  timestamptz not null default now()
);

-- ───────────────────────────── grupos ─────────────────────────────
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('junta', 'promocion', 'pandero')),
  name          text not null check (char_length(name) between 1 and 60),
  code          text unique check (code is null or code ~ '^AYNI-[A-Z0-9]{4}$'),
  capacity      int  not null check (capacity between 2 and 200),
  creator_id    uuid not null references public.profiles(id),
  archived      boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),

  -- grupo con fondo común
  nature        text check (nature is null or char_length(nature) <= 60),
  goal_stroops  bigint check (goal_stroops is null or goal_stroops > 0),
  due_date      date,
  release_date  date,
  rule          text check (rule in ('fecha', 'meta')),
  status        text check (status in ('custodia', 'listo', 'liberado')),
  admissions_open boolean not null default true,
  date_reached  boolean not null default false,
  ready_at      timestamptz,
  released_at   timestamptz,
  released_amount_stroops bigint,
  released_to   uuid references public.profiles(id),
  released_tx_hash text,
  -- candado de disposición: evita enviar dos veces el fondo por doble clic / reintentos concurrentes
  disposal_lock_at timestamptz,

  -- pandero
  cuota_stroops bigint check (cuota_stroops is null or cuota_stroops > 0),
  visibility    text check (visibility in ('publico', 'privado')),
  phase         text check (phase in ('reclutando', 'espera', 'juego', 'terminado')),
  round         int  not null default 0,
  start_date    date,

  constraint groups_kind_columns check (
    (kind = 'pandero'
      and cuota_stroops is not null and visibility is not null and phase is not null
      and goal_stroops is null and capacity <= 50)
    or
    (kind <> 'pandero'
      and goal_stroops is not null and rule is not null and status is not null
      and due_date is not null and release_date is not null)
  ),
  -- panderos públicos no tienen código; privados sí. Fondos comunes siempre tienen código.
  constraint groups_code_rules check (
    (kind = 'pandero' and ((visibility = 'privado') = (code is not null)))
    or (kind <> 'pandero' and code is not null)
  )
);
create index groups_creator_idx on public.groups (creator_id);

create table public.group_members (
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('treasurer', 'member')),
  position     int  not null default 0,
  joined_at    timestamptz not null default now(),
  paid_stroops bigint not null default 0 check (paid_stroops >= 0),
  paid_at      timestamptz,
  reminders    int  not null default 0,
  paid_round   int  not null default 0,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create unique index group_members_one_treasurer on public.group_members (group_id) where role = 'treasurer';

-- El creador de un pandero NO obtiene privilegios: un pandero nunca tiene tesorero.
create or replace function public.enforce_no_pandero_treasurer() returns trigger
language plpgsql as $$
begin
  if new.role = 'treasurer' and (select kind from public.groups where id = new.group_id) = 'pandero' then
    raise exception 'pandero_has_no_treasurer' using errcode = 'AY002';
  end if;
  return new;
end $$;
create trigger group_members_no_pandero_treasurer
  before insert or update of role on public.group_members
  for each row execute function public.enforce_no_pandero_treasurer();

-- Intentos fallidos de códigos de invitación (limita la fuerza bruta: 31^4 ≈ 923k códigos posibles).
-- Sin políticas ni privilegios para clientes: solo las funciones SECURITY DEFINER la usan.
create table public.code_attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index code_attempts_user_idx on public.code_attempts (user_id, at desc);

-- ───────────────────────────── wallets (solo metadatos; NUNCA claves) ─────────────────────────────
create table public.wallet_accounts (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  stellar_address text not null check (stellar_address ~ '^G[A-Z2-7]{55}$'),
  network         text not null default 'TESTNET' check (network = 'TESTNET'),
  provider        text not null default 'freighter' check (provider in ('freighter', 'cavos', 'privy')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ───────────────────────────── pagos y registro ─────────────────────────────
create table public.contributions (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  user_id         uuid not null references public.profiles(id),
  amount_stroops  bigint not null check (amount_stroops > 0),
  stellar_tx_hash text not null unique check (stellar_tx_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null unique,
  status          text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz
);
create index contributions_group_idx on public.contributions (group_id);

create table public.ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  direction       text not null check (direction in ('in', 'out')),
  amount_stroops  bigint not null check (amount_stroops > 0),
  description     text not null,
  method          text,
  tx_hash         text check (tx_hash is null or tx_hash ~ '^[0-9a-f]{64}$'),
  actor_id        uuid references public.profiles(id),
  contribution_id uuid references public.contributions(id),
  created_at      timestamptz not null default now()
);
create index ledger_group_idx on public.ledger_entries (group_id, created_at desc);
-- un hash de Stellar no puede registrarse dos veces en el ledger
create unique index ledger_tx_hash_unique on public.ledger_entries (tx_hash) where tx_hash is not null;

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  group_id   uuid references public.groups(id) on delete cascade,
  key        text not null,
  type       text not null check (type in ('refund','eve','full','closed','start','debit','nofunds','pot','owe','round','info')),
  title      text not null,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ───────────────────────────── pandero (rondas) ─────────────────────────────
create table public.pandero_turns (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  turn     int  not null check (turn >= 1),
  primary key (group_id, user_id),
  unique (group_id, turn)
);

create table public.pandero_rounds (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.groups(id) on delete cascade,
  round            int  not null check (round >= 1),
  payout_user_id   uuid references public.profiles(id),
  payout_date      date,
  paid_out         boolean not null default false,
  payout_tx_hash   text,
  unique (group_id, round)
);

create table public.pandero_contributions (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  round          int  not null check (round >= 1),
  user_id        uuid not null references public.profiles(id),
  amount_stroops bigint not null check (amount_stroops > 0),
  tx_hash        text unique,
  status         text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  created_at     timestamptz not null default now(),
  unique (group_id, round, user_id)
);

-- ───────────────────────────── alta automática de perfil ─────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, phone, address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'address', '')
  );
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
