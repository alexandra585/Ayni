import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Base de datos de pruebas: PostgreSQL real (PGlite, WASM) con las MISMAS migraciones que Supabase.
 * Emulamos lo mínimo de Supabase: roles anon/authenticated/service_role y auth.uid()/auth.users.
 */
const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  return db;
}

export type Role = "authenticated" | "anon" | "service_role";

/** Cambia el rol de la sesión (equivale a la petición de un usuario con ese JWT). */
export async function as(db: PGlite, role: Role | "superuser", uid?: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  if (role !== "superuser") await db.exec(`set role ${role};`);
}

export async function addUser(db: PGlite, name: string, email: string): Promise<{ id: string; code: string }> {
  await as(db, "superuser");
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`,
    [email, name],
  );
  const id = r.rows[0].id;
  const p = await db.query<{ user_code: string }>(`select user_code from public.profiles where id = $1`, [id]);
  return { id, code: p.rows[0].user_code };
}

export const XLM = (n: number) => BigInt(Math.round(n * 1e7));

export async function createFund(db: PGlite, uid: string, over: Record<string, unknown> = {}): Promise<string> {
  await as(db, "authenticated", uid);
  const p = {
    kind: "junta", name: "Vigilancia", capacity: 4, nature: "Juntas vecinales",
    goal_stroops: String(XLM(200)), due_date: "2099-01-01", release_date: "2099-02-01", rule: "fecha", ...over,
  };
  const r = await db.query<{ create_group: string }>(`select public.create_group($1::jsonb) as create_group`, [JSON.stringify(p)]);
  return r.rows[0].create_group;
}
