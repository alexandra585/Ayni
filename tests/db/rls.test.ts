// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { XLM, addUser, as, createDb, createFund } from "./pg";

let db: PGlite;
let rosa: { id: string; code: string }; // tesorera
let jorge: { id: string; code: string };
let lucia: { id: string; code: string };

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const rpc = async (fn: string, ...args: unknown[]) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  const r = await q<Record<string, unknown>>(`select public.${fn}(${ph}) as r`, args);
  return r[0].r as Record<string, unknown>;
};

beforeAll(async () => {
  db = await createDb();
  rosa = await addUser(db, "Rosa Quispe", "rosa@correo.com");
  jorge = await addUser(db, "Jorge Mamani", "jorge@correo.com");
  lucia = await addUser(db, "Lucía Huamán", "lucia@correo.com");
}, 60_000);
afterAll(async () => { await db.close(); });

describe("perfiles", () => {
  it("se crea automáticamente al registrar el usuario, con código USR-XXXX", async () => {
    await as(db, "authenticated", rosa.id);
    const [p] = await q<{ name: string; user_code: string }>(`select name, user_code from public.profiles where id = $1`, [rosa.id]);
    expect(p.name).toBe("Rosa Quispe");
    expect(p.user_code).toMatch(/^USR-[A-Z0-9]{4}$/);
  });
  it("cada usuario lee su propio perfil pero NO el de desconocidos", async () => {
    await as(db, "authenticated", jorge.id);
    expect(await q(`select id from public.profiles`)).toHaveLength(1);
  });
  it("puede editar sus datos, pero no su user_code ni el perfil de otro", async () => {
    await as(db, "authenticated", jorge.id);
    await q(`update public.profiles set name = 'Jorge M.' where id = $1`, [jorge.id]);
    expect((await q<{ name: string }>(`select name from public.profiles where id = $1`, [jorge.id]))[0].name).toBe("Jorge M.");
    await expect(q(`update public.profiles set user_code = 'USR-HACK' where id = $1`, [jorge.id])).rejects.toThrow(/permission denied/);
    // sobre el perfil de otro no actualiza ninguna fila (RLS)
    await q(`update public.profiles set name = 'hackeado' where id = $1`, [rosa.id]);
    await as(db, "superuser");
    expect((await q<{ name: string }>(`select name from public.profiles where id = $1`, [rosa.id]))[0].name).toBe("Rosa Quispe");
  });
});

describe("grupos: escritura solo vía funciones", () => {
  it("un cliente no puede insertar ni modificar grupos directamente", async () => {
    await as(db, "authenticated", rosa.id);
    await expect(q(`insert into public.groups (kind,name,capacity,creator_id) values ('junta','x',3,$1)`, [rosa.id])).rejects.toThrow(/permission denied/);
    const gid = await createFund(db, rosa.id);
    await expect(q(`update public.groups set goal_stroops = 1 where id = $1`, [gid])).rejects.toThrow(/permission denied/);
    await expect(q(`delete from public.groups where id = $1`, [gid])).rejects.toThrow(/permission denied/);
  });

  it("crear un fondo común: el creador es tesorero y el código es AYNI-XXXX", async () => {
    const gid = await createFund(db, rosa.id);
    await as(db, "authenticated", rosa.id);
    const [g] = await q<{ code: string; status: string; capacity: number }>(`select code, status, capacity from public.groups where id = $1`, [gid]);
    expect(g.code).toMatch(/^AYNI-[A-Z0-9]{4}$/);
    expect(g.status).toBe("custodia");
    const [m] = await q<{ role: string }>(`select role from public.group_members where group_id = $1 and user_id = $2`, [gid, rosa.id]);
    expect(m.role).toBe("treasurer");
  });

  it("crear un pandero: el creador es participante SIN privilegios (no existe tesorero de pandero)", async () => {
    await as(db, "authenticated", rosa.id);
    const [{ create_group: gid }] = await q<{ create_group: string }>(
      `select public.create_group($1::jsonb) as create_group`,
      [JSON.stringify({ kind: "pandero", name: "Pandero del taller", capacity: 8, cuota_stroops: String(XLM(400)), visibility: "privado" })],
    );
    const [m] = await q<{ role: string }>(`select role from public.group_members where group_id = $1`, [gid]);
    expect(m.role).toBe("member");
    // ni siquiera con acceso de superusuario se puede asignar tesorero a un pandero (trigger)
    await as(db, "superuser");
    await expect(q(`update public.group_members set role = 'treasurer' where group_id = $1`, [gid])).rejects.toThrow(/pandero_has_no_treasurer/);
    // y las funciones administrativas rechazan al creador del pandero
    await as(db, "authenticated", rosa.id);
    await expect(rpc("set_admissions", gid, false)).rejects.toThrow(/forbidden/);
    await expect(rpc("apply_change", gid, String(XLM(100)))).rejects.toThrow(/forbidden/);
    await expect(rpc("archive_group", gid)).rejects.toThrow(/forbidden/); // aún no terminó
  });

  it("valida capacidad de pandero (2–50) y nombre", async () => {
    await as(db, "authenticated", rosa.id);
    await expect(q(`select public.create_group($1::jsonb)`, [JSON.stringify({ kind: "pandero", name: "x", capacity: 51, cuota_stroops: "1", visibility: "publico" })])).rejects.toThrow(/invalid_capacity/);
    await expect(q(`select public.create_group($1::jsonb)`, [JSON.stringify({ kind: "junta", name: "  ", capacity: 5 })])).rejects.toThrow(/invalid_name/);
  });
});

describe("unirse por código (join_group_by_code)", () => {
  let gid: string;
  let code: string;
  beforeAll(async () => {
    gid = await createFund(db, rosa.id, { name: "Fondo del edificio", capacity: 3 });
    await as(db, "authenticated", rosa.id);
    code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
  });

  it("valida longitud (exactamente 9) y formato", async () => {
    await as(db, "authenticated", jorge.id);
    expect(await rpc("join_group_by_code", code.slice(5))).toMatchObject({ ok: false, error: "code_length" });
    expect(await rpc("join_group_by_code", "ABCD-12345")).toMatchObject({ ok: false, error: "code_length" });
    expect(await rpc("join_group_by_code", "XXXX-12345".slice(0, 9))).toMatchObject({ ok: false, error: "code_format" });
    expect(await rpc("join_group_by_code", "AYNI-ZZZZ")).toMatchObject({ ok: false, error: "not_found" });
  });

  it("un no miembro NO puede leer el grupo privado, sus miembros ni su registro", async () => {
    await as(db, "authenticated", jorge.id);
    expect(await q(`select id from public.groups where id = $1`, [gid])).toHaveLength(0);
    expect(await q(`select 1 from public.group_members where group_id = $1`, [gid])).toHaveLength(0);
    expect(await q(`select 1 from public.ledger_entries where group_id = $1`, [gid])).toHaveLength(0);
  });

  it("une, es idempotente para quien ya es miembro y respeta la capacidad", async () => {
    await as(db, "authenticated", jorge.id);
    expect(await rpc("join_group_by_code", code.toLowerCase())).toMatchObject({ ok: true, result: "joined", group_id: gid });
    expect(await rpc("join_group_by_code", code)).toMatchObject({ ok: true, result: "already" });
    await as(db, "authenticated", lucia.id);
    expect(await rpc("join_group_by_code", code)).toMatchObject({ ok: true, result: "joined" });
    const extra = await addUser(db, "Carlos Torres", "carlos@correo.com");
    await as(db, "authenticated", extra.id);
    expect(await rpc("join_group_by_code", code)).toMatchObject({ ok: false, error: "group_full" });
    // el tesorero fue notificado de que el grupo llegó a su capacidad
    await as(db, "authenticated", rosa.id);
    const n = await q<{ title: string }>(`select title from public.notifications where type = 'full'`);
    expect(n.some((x) => x.title.includes("capacidad máxima"))).toBe(true);
  });

  it("con el ingreso cerrado nadie más puede unirse por código", async () => {
    const g2 = await createFund(db, rosa.id, { name: "Cerrado" });
    await as(db, "authenticated", rosa.id);
    const c2 = (await q<{ code: string }>(`select code from public.groups where id = $1`, [g2]))[0].code;
    await rpc("set_admissions", g2, false);
    await as(db, "authenticated", jorge.id);
    expect(await rpc("join_group_by_code", c2)).toMatchObject({ ok: false, error: "admissions_closed" });
  });

  it("un pandero privado exige términos y el código para unirse; los públicos se listan en el foro", async () => {
    await as(db, "authenticated", rosa.id);
    const [{ create_group: priv }] = await q<{ create_group: string }>(`select public.create_group($1::jsonb) as create_group`,
      [JSON.stringify({ kind: "pandero", name: "Privado", capacity: 2, cuota_stroops: String(XLM(100)), visibility: "privado" })]);
    const [{ create_group: pub }] = await q<{ create_group: string }>(`select public.create_group($1::jsonb) as create_group`,
      [JSON.stringify({ kind: "pandero", name: "Público", capacity: 2, cuota_stroops: String(XLM(100)), visibility: "publico" })]);
    const pcode = (await q<{ code: string }>(`select code from public.groups where id = $1`, [priv]))[0].code;
    expect((await q<{ code: string | null }>(`select code from public.groups where id = $1`, [pub]))[0].code).toBeNull();

    await as(db, "authenticated", jorge.id);
    // el privado no se puede enumerar
    expect(await q(`select id from public.groups where id = $1`, [priv])).toHaveLength(0);
    expect(await rpc("join_group_by_code", pcode)).toMatchObject({ ok: true, result: "needs_terms", group_id: priv });
    // sin código correcto, join_pandero no revela ni une
    expect(await rpc("join_pandero", priv, "AYNI-0000")).toMatchObject({ ok: false, error: "not_found" });
    expect(await rpc("join_pandero", priv, pcode)).toMatchObject({ ok: true, result: "joined" });
    // al completarse cierra el ingreso y pasa a espera
    const [g] = await q<{ phase: string }>(`select phase from public.groups where id = $1`, [priv]);
    expect(g.phase).toBe("espera");
    // el público es visible en el foro (sin exponer miembros) y se puede unir sin código
    const forum = await q<{ name: string; member_count: number }>(`select name, member_count from public.list_public_panderos()`);
    expect(forum.map((f) => f.name)).toEqual(["Público"]);
    expect(forum[0].member_count).toBe(1);
    expect(await rpc("join_pandero", pub)).toMatchObject({ ok: true, result: "joined" });
    await as(db, "authenticated", lucia.id);
    expect(await q(`select 1 from public.group_members where group_id = $1`, [pub])).toHaveLength(0); // no ve miembros ajenos
  });
});

describe("permisos: tesorero vs participante", () => {
  let gid: string;
  beforeAll(async () => {
    gid = await createFund(db, rosa.id, { name: "Permisos", capacity: 4 });
    await as(db, "authenticated", rosa.id);
    const code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
    await as(db, "authenticated", jorge.id);
    await rpc("join_group_by_code", code);
    await as(db, "authenticated", lucia.id);
    await rpc("join_group_by_code", code);
  });

  it("el participante NO puede cambiar el monto, quitar miembros, cambiar el ingreso, agregar miembros ni archivar", async () => {
    await as(db, "authenticated", jorge.id);
    await expect(rpc("apply_change", gid, String(XLM(100)))).rejects.toThrow(/forbidden/);
    await expect(rpc("apply_change", gid, null, lucia.id, 0)).rejects.toThrow(/forbidden/);
    await expect(rpc("set_admissions", gid, false)).rejects.toThrow(/forbidden/);
    await expect(rpc("add_member_by_user_code", gid, rosa.code)).rejects.toThrow(/forbidden/);
    await expect(rpc("archive_group", gid)).rejects.toThrow(/forbidden/);
    await expect(rpc("new_cycle", gid)).rejects.toThrow(/forbidden/);
  });

  it("el participante no puede fabricar dinero ni escribir en el ledger, contribuciones o notificaciones ajenas", async () => {
    await as(db, "authenticated", jorge.id);
    await expect(q(`insert into public.ledger_entries (group_id,direction,amount_stroops,description) values ($1,'in',1,'x')`, [gid])).rejects.toThrow(/permission denied/);
    await expect(q(`insert into public.contributions (group_id,user_id,amount_stroops,stellar_tx_hash,idempotency_key) values ($1,$2,1,$3,'k')`, [gid, jorge.id, "a".repeat(64)])).rejects.toThrow(/permission denied/);
    await expect(q(`update public.group_members set paid_stroops = 999999999999 where group_id = $1 and user_id = $2`, [gid, jorge.id])).rejects.toThrow(/permission denied/);
    await expect(q(`insert into public.notifications (user_id,key,type,title,body) values ($1,'k','info','t','b')`, [jorge.id])).rejects.toThrow(/permission denied/);
  });

  it("no puede ejecutar las funciones de registro de dinero (solo service_role)", async () => {
    await as(db, "authenticated", rosa.id);
    await expect(rpc("record_contribution", gid, rosa.id, String(XLM(50)), "b".repeat(64), "k1")).rejects.toThrow(/permission denied/);
    await expect(rpc("record_disposal", gid, rosa.id, rosa.id, String(XLM(1)), "c".repeat(64))).rejects.toThrow(/permission denied/);
    await as(db, "anon");
    await expect(rpc("create_group", "{}")).rejects.toThrow(/permission denied/);
  });

  it("el tesorero agrega miembros por código de usuario y cambia el ingreso", async () => {
    await as(db, "authenticated", rosa.id);
    const extra = await addUser(db, "Pedro Condori", "pedro@correo.com");
    await as(db, "authenticated", rosa.id);
    expect(await rpc("add_member_by_user_code", gid, rosa.code)).toMatchObject({ ok: false, error: "own_code" });
    expect(await rpc("add_member_by_user_code", gid, "USR-NOPE")).toMatchObject({ ok: false, error: "no_user" });
    expect(await rpc("add_member_by_user_code", gid, jorge.code)).toMatchObject({ ok: false, error: "already_member" });
    expect(await rpc("add_member_by_user_code", gid, extra.code)).toMatchObject({ ok: true, result: "added" });
    // grupo lleno (4/4) → hay que sumar un cupo
    const another = await addUser(db, "Ana Flores", "ana@correo.com");
    await as(db, "authenticated", rosa.id);
    expect(await rpc("add_member_by_user_code", gid, another.code)).toMatchObject({ ok: true, result: "needs_recalc", user_id: another.id });
    expect(await rpc("apply_change", gid, null, null, 1, another.id)).toMatchObject({ ok: true });
    const [g] = await q<{ capacity: number }>(`select capacity from public.groups where id = $1`, [gid]);
    expect(g.capacity).toBe(5);
    await rpc("set_admissions", gid, false);
    expect((await q<{ admissions_open: boolean }>(`select admissions_open from public.groups where id = $1`, [gid]))[0].admissions_open).toBe(false);
  });
});

describe("pagos verificados (service_role) y ledger", () => {
  let gid: string;
  const hash = (c: string) => c.repeat(64);
  beforeAll(async () => {
    gid = await createFund(db, rosa.id, { name: "Pagos", capacity: 2, goal_stroops: String(XLM(100)), rule: "meta" });
    await as(db, "authenticated", rosa.id);
    const code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
    await as(db, "authenticated", jorge.id);
    await rpc("join_group_by_code", code);
  });

  it("contribution_due = cuota (100 XLM / 2 = 50 XLM) y solo el backend lo consulta", async () => {
    await as(db, "service_role");
    expect(await q<{ d: string }>(`select public.contribution_due($1, $2)::text as d`, [gid, jorge.id])).toEqual([{ d: String(XLM(50)) }]);
    await as(db, "authenticated", jorge.id);
    await expect(q(`select public.contribution_due($1, $2)`, [gid, jorge.id])).rejects.toThrow(/permission denied/);
  });

  it("rechaza montos incorrectos y miembros ajenos", async () => {
    await as(db, "service_role");
    expect(await rpc("record_contribution", gid, jorge.id, String(XLM(49)), hash("a"), "i0")).toMatchObject({ ok: false, error: "wrong_amount" });
    expect(await rpc("record_contribution", gid, lucia.id, String(XLM(50)), hash("a"), "i0")).toMatchObject({ ok: false, error: "not_member" });
  });

  it("registra el pago de forma atómica: contribución + miembro + ledger + notificación", async () => {
    await as(db, "service_role");
    expect(await rpc("record_contribution", gid, jorge.id, String(XLM(50)), hash("a"), "idem-1")).toMatchObject({ ok: true });
    await as(db, "authenticated", jorge.id);
    const [m] = await q<{ paid_stroops: string }>(`select paid_stroops::text from public.group_members where group_id = $1 and user_id = $2`, [gid, jorge.id]);
    expect(m.paid_stroops).toBe(String(XLM(50)));
    const led = await q<{ direction: string; description: string; tx_hash: string; amount_stroops: string }>(`select direction, description, tx_hash, amount_stroops::text from public.ledger_entries where group_id = $1`, [gid]);
    expect(led).toEqual([{ direction: "in", description: "Cuota de Jorge M.", tx_hash: hash("a"), amount_stroops: String(XLM(50)) }]);
    expect((await q(`select 1 from public.notifications where user_id = $1 and type = 'debit'`, [jorge.id])).length).toBe(1);
  });

  it("es idempotente ante doble clic/reintento y rechaza reutilizar el mismo hash", async () => {
    await as(db, "service_role");
    // mismo hash + mismo usuario (reintento): no duplica
    expect(await rpc("record_contribution", gid, jorge.id, String(XLM(50)), hash("a"), "idem-1")).toMatchObject({ ok: true, duplicate: true });
    // una cuota ya pagada con OTRO hash no se puede volver a pagar
    expect(await rpc("record_contribution", gid, jorge.id, String(XLM(50)), hash("c"), "idem-9")).toMatchObject({ ok: false, error: "nothing_due" });
    // el mismo hash NO sirve para pagar la cuota de otra persona
    expect(await rpc("record_contribution", gid, rosa.id, String(XLM(50)), hash("a"), "idem-2")).toMatchObject({ ok: false, error: "hash_already_used" });
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from public.ledger_entries where group_id = $1`, [gid]);
    expect(n).toBe(1);
  });

  it("no se puede disponer del fondo antes del cierre; al completar la meta pasa a 'listo' y solo el tesorero dispone", async () => {
    await as(db, "service_role");
    expect(await rpc("record_disposal", gid, rosa.id, rosa.id, String(XLM(50)), hash("d"))).toMatchObject({ ok: false, error: "not_ready" });
    expect(await rpc("record_contribution", gid, rosa.id, String(XLM(50)), hash("b"), "idem-3")).toMatchObject({ ok: true });
    expect((await q<{ status: string }>(`select status from public.groups where id = $1`, [gid]))[0].status).toBe("listo");
    // participante ≠ tesorero
    expect(await rpc("record_disposal", gid, jorge.id, jorge.id, String(XLM(100)), hash("d"))).toMatchObject({ ok: false, error: "forbidden" });
    // monto distinto al recaudado
    expect(await rpc("record_disposal", gid, rosa.id, rosa.id, String(XLM(99)), hash("d"))).toMatchObject({ ok: false, error: "wrong_amount" });
    expect(await rpc("record_disposal", gid, rosa.id, rosa.id, String(XLM(100)), hash("d"))).toMatchObject({ ok: true, amount: Number(XLM(100)) });
    const [g] = await q<{ status: string; released_tx_hash: string }>(`select status, released_tx_hash from public.groups where id = $1`, [gid]);
    expect(g).toEqual({ status: "liberado", released_tx_hash: hash("d") });
    // una vez liberado no se puede volver a disponer ni a pagar
    expect(await rpc("record_disposal", gid, rosa.id, rosa.id, String(XLM(100)), hash("e"))).toMatchObject({ ok: false, error: "not_ready" });
    expect(await rpc("record_contribution", gid, rosa.id, String(XLM(50)), hash("f"), "idem-4")).toMatchObject({ ok: false, error: "not_in_custody" });
  });

  it("el miembro ve el registro transparente completo (entradas y salida) con sus hashes", async () => {
    await as(db, "authenticated", jorge.id);
    const led = await q<{ direction: string }>(`select direction from public.ledger_entries where group_id = $1 order by created_at`, [gid]);
    expect(led.map((l) => l.direction)).toEqual(["in", "in", "out"]);
  });

  it("archivar/nuevo ciclo: solo el tesorero y solo con el fondo liberado", async () => {
    await as(db, "authenticated", jorge.id);
    await expect(rpc("archive_group", gid)).rejects.toThrow(/forbidden/);
    await as(db, "authenticated", rosa.id);
    await rpc("new_cycle", gid);
    const [g] = await q<{ status: string }>(`select status from public.groups where id = $1`, [gid]);
    expect(g.status).toBe("custodia");
    await expect(rpc("archive_group", gid)).rejects.toThrow(/forbidden/); // ya no está liberado
  });
});

describe("fuerza bruta de códigos y candado de disposición", () => {
  it("tras 20 códigos inexistentes en 10 minutos el usuario queda limitado (rate_limited)", async () => {
    const attacker = await addUser(db, "Intruso", "intruso@correo.com");
    await as(db, "authenticated", attacker.id);
    for (let i = 0; i < 20; i++) expect(await rpc("join_group_by_code", "AYNI-ZZZ" + (i % 10))).toMatchObject({ error: "not_found" });
    expect(await rpc("join_group_by_code", "AYNI-ZZZZ")).toMatchObject({ ok: false, error: "rate_limited" });
    // incluso un código válido queda bloqueado mientras dure el límite
    const gid = await createFund(db, rosa.id, { name: "Rate" });
    await as(db, "authenticated", rosa.id);
    const code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
    await as(db, "authenticated", attacker.id);
    expect(await rpc("join_group_by_code", code)).toMatchObject({ ok: false, error: "rate_limited" });
    // el cliente no puede leer ni borrar el contador
    await expect(q(`select * from public.code_attempts`)).rejects.toThrow(/permission denied/);
    await expect(q(`delete from public.code_attempts`)).rejects.toThrow(/permission denied/);
  });

  it("begin_disposal: solo con el fondo 'listo', solo el tesorero y un único envío a la vez", async () => {
    const gid = await createFund(db, rosa.id, { name: "Lock", capacity: 2, goal_stroops: String(XLM(100)), rule: "meta" });
    await as(db, "authenticated", rosa.id);
    const code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
    await as(db, "authenticated", lucia.id);
    await rpc("join_group_by_code", code);
    await as(db, "service_role");
    expect(await rpc("begin_disposal", gid, rosa.id)).toMatchObject({ ok: false, error: "not_ready" });
    await rpc("record_contribution", gid, rosa.id, String(XLM(50)), "7".repeat(64), "l1");
    await rpc("record_contribution", gid, lucia.id, String(XLM(50)), "8".repeat(64), "l2"); // meta completa → 'listo'
    expect(await rpc("begin_disposal", gid, lucia.id)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await rpc("begin_disposal", gid, rosa.id)).toMatchObject({ ok: true });
    expect(await rpc("begin_disposal", gid, rosa.id)).toMatchObject({ ok: false, error: "in_progress" }); // 2.º intento simultáneo
    await rpc("abort_disposal", gid);
    expect(await rpc("begin_disposal", gid, rosa.id)).toMatchObject({ ok: true }); // tras abortar se puede reintentar
    expect(await rpc("record_disposal", gid, rosa.id, rosa.id, String(XLM(100)), "9".repeat(64))).toMatchObject({ ok: true });
    expect((await q<{ disposal_lock_at: string | null }>(`select disposal_lock_at from public.groups where id = $1`, [gid]))[0].disposal_lock_at).toBeNull();
    // un cliente autenticado no puede tomar ni soltar el candado
    await as(db, "authenticated", rosa.id);
    await expect(rpc("begin_disposal", gid, rosa.id)).rejects.toThrow(/permission denied/);
    await expect(rpc("abort_disposal", gid)).rejects.toThrow(/permission denied/);
  });
});

describe("recálculo de cuotas con devoluciones (apply_change)", () => {
  it("al bajar el monto devuelve la diferencia a quien pagó de más y lo registra + notifica", async () => {
    const gid = await createFund(db, rosa.id, { name: "Recalc", capacity: 2, goal_stroops: String(XLM(200)) });
    await as(db, "authenticated", rosa.id);
    const code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
    await as(db, "authenticated", jorge.id);
    await rpc("join_group_by_code", code);
    await as(db, "service_role");
    await rpc("record_contribution", gid, jorge.id, String(XLM(100)), "1".repeat(64), "r1");
    await as(db, "authenticated", rosa.id);
    expect(await rpc("apply_change", gid, String(XLM(120)))).toMatchObject({ ok: true }); // cuota 60
    await as(db, "authenticated", jorge.id);
    const [m] = await q<{ paid_stroops: string }>(`select paid_stroops::text from public.group_members where group_id = $1 and user_id = $2`, [gid, jorge.id]);
    expect(m.paid_stroops).toBe(String(XLM(60)));
    const led = await q<{ direction: string; amount_stroops: string; method: string }>(`select direction, amount_stroops::text, method from public.ledger_entries where group_id = $1 and direction = 'out'`, [gid]);
    expect(led).toEqual([{ direction: "out", amount_stroops: String(XLM(40)), method: "Devolución automática" }]);
    expect((await q<{ title: string }>(`select title from public.notifications where user_id = $1 and type = 'refund'`, [jorge.id]))[0].title).toContain("40.00 XLM");
  });
  it("quitar un miembro le devuelve lo abonado; el tesorero no puede quitarse a sí mismo", async () => {
    const gid = await createFund(db, rosa.id, { name: "Quitar", capacity: 3 });
    await as(db, "authenticated", rosa.id);
    const code = (await q<{ code: string }>(`select code from public.groups where id = $1`, [gid]))[0].code;
    await as(db, "authenticated", lucia.id);
    await rpc("join_group_by_code", code);
    await as(db, "authenticated", rosa.id);
    expect(await rpc("apply_change", gid, null, rosa.id, 0)).toMatchObject({ ok: false, error: "cannot_remove_self" });
    expect(await rpc("apply_change", gid, null, lucia.id, -1)).toMatchObject({ ok: true });
    expect(await q(`select 1 from public.group_members where group_id = $1`, [gid])).toHaveLength(1);
    expect((await q<{ capacity: number }>(`select capacity from public.groups where id = $1`, [gid]))[0].capacity).toBe(2);
  });
});

describe("notificaciones y wallets", () => {
  it("cada usuario ve y marca como leídas solo las suyas", async () => {
    await as(db, "authenticated", jorge.id);
    const mine = await q<{ id: string; read: boolean }>(`select id, read from public.notifications`);
    expect(mine.length).toBeGreaterThan(0);
    await q(`update public.notifications set read = true`);
    expect((await q<{ read: boolean }>(`select read from public.notifications`)).every((n) => n.read)).toBe(true);
    // no puede cambiar el contenido
    await expect(q(`update public.notifications set title = 'x'`)).rejects.toThrow(/permission denied/);
  });
  it("wallet_accounts: solo metadatos propios, dirección G… válida y solo TESTNET", async () => {
    await as(db, "authenticated", jorge.id);
    const addr = "G" + "A".repeat(55);
    await q(`insert into public.wallet_accounts (user_id, stellar_address) values ($1, $2)`, [jorge.id, addr]);
    await expect(q(`insert into public.wallet_accounts (user_id, stellar_address) values ($1, $2)`, [lucia.id, addr])).rejects.toThrow(/row-level security/);
    await as(db, "authenticated", lucia.id);
    await expect(q(`insert into public.wallet_accounts (user_id, stellar_address) values ($1, 'no-es-una-direccion')`, [lucia.id])).rejects.toThrow(/check constraint/);
    await expect(q(`insert into public.wallet_accounts (user_id, stellar_address, network) values ($1, $2, 'PUBLIC')`, [lucia.id, addr])).rejects.toThrow(/check constraint/);
    expect(await q(`select 1 from public.wallet_accounts`)).toHaveLength(0);
  });
});
