// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as } from "./pg";

/** Verifica que supabase/seed.sql se ejecuta sobre el esquema real y respeta las reglas (RLS, roles). */
let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create extension pgcrypto;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz, updated_at timestamptz, confirmation_token text, email_change text, email_change_token_new text, recovery_token text);
    create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  const { readdirSync } = await import("node:fs");
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.exec(readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8"));
}, 60_000);
afterAll(async () => { await db.close(); });

describe("seed.sql", () => {
  it("crea 3 usuarios con perfil y códigos de usuario fijos", async () => {
    const r = await db.query<{ user_code: string }>(`select user_code from public.profiles order by user_code`);
    expect(r.rows.map((x) => x.user_code)).toEqual(["USR-JORG", "USR-LUCI", "USR-ROSA"]);
  });
  it("Rosa (tesorera) ve el fondo demo y su registro; Jorge también; Lucía no (es un grupo privado)", async () => {
    await as(db, "authenticated", "11111111-1111-4111-8111-111111111111");
    expect((await db.query(`select 1 from public.groups where code = 'AYNI-DEMO'`)).rows).toHaveLength(1);
    expect((await db.query(`select 1 from public.ledger_entries`)).rows).toHaveLength(1);
    await as(db, "authenticated", "33333333-3333-4333-8333-333333333333");
    expect((await db.query(`select 1 from public.groups where code = 'AYNI-DEMO'`)).rows).toHaveLength(0);
  });
  it("el pandero público del foro es visible para todos; su creadora no es tesorera", async () => {
    await as(db, "authenticated", "22222222-2222-4222-8222-222222222222");
    const forum = await db.query<{ name: string }>(`select name from public.list_public_panderos()`);
    expect(forum.rows.map((x) => x.name)).toEqual(["Pandero Mercado Caquetá"]);
    await as(db, "superuser");
    const m = await db.query<{ role: string }>(`select role from public.group_members where group_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'`);
    expect(m.rows[0].role).toBe("member");
  });
});
