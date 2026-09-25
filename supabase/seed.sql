-- Ayni · datos de demostración (solo desarrollo local; se ejecuta con `supabase db reset`).
-- Usuarios de prueba (contraseña de todos: ayni-demo-123):
--   rosa@ayni.demo  (tesorera del fondo demo)   ·   jorge@ayni.demo   ·   lucia@ayni.demo
-- Los hashes de transacción del ledger son ficticios (marcados con ceros): en la app real
-- los pagos se verifican contra Stellar Testnet antes de registrarse.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'rosa@ayni.demo', crypt('ayni-demo-123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"name":"Rosa Quispe"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'jorge@ayni.demo', crypt('ayni-demo-123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"name":"Jorge Mamani"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'lucia@ayni.demo', crypt('ayni-demo-123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"name":"Lucía Huamán"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u where u.email like '%@ayni.demo'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- Códigos de usuario fijos para poder probar "Agregar por código".
update public.profiles set user_code = 'USR-ROSA' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set user_code = 'USR-JORG' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set user_code = 'USR-LUCI' where id = '33333333-3333-4333-8333-333333333333';

-- Fondo común de ejemplo: Rosa es tesorera; meta 150 XLM entre 3 → cuota 50 XLM.
insert into public.groups (id, kind, name, code, capacity, creator_id, nature, goal_stroops, due_date, release_date, rule, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'junta', 'Vigilancia Jr. Los Olivos', 'AYNI-DEMO', 3,
        '11111111-1111-4111-8111-111111111111', 'Juntas vecinales', 1500000000, current_date + 7, current_date + 30, 'fecha', 'custodia')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, position, paid_stroops, paid_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'treasurer', 0, 0, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 1, 500000000, now() - interval '2 days')
on conflict do nothing;

insert into public.ledger_entries (group_id, direction, amount_stroops, description, method, tx_hash, actor_id, created_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'in', 500000000, 'Cuota de Jorge Mamani', 'Stellar Testnet',
        repeat('0', 63) || '1', '22222222-2222-4222-8222-222222222222', now() - interval '2 days')
on conflict do nothing;

-- Pandero público para el foro (Lucía lo creó: es una participante más, sin privilegios).
insert into public.groups (id, kind, name, code, capacity, creator_id, cuota_stroops, visibility, phase)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pandero', 'Pandero Mercado Caquetá', null, 10,
        '33333333-3333-4333-8333-333333333333', 2000000000, 'publico', 'reclutando')
on conflict (id) do nothing;
insert into public.group_members (group_id, user_id, role, position)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'member', 0)
on conflict do nothing;
