# Supabase

## Puesta en marcha local

```bash
pnpm exec supabase start        # requiere Docker
pnpm exec supabase db reset     # aplica supabase/migrations/* y supabase/seed.sql
```

Copia `.env.example` → `.env.local`, pon `NEXT_PUBLIC_AYNI_MODE=supabase` y las claves que imprime `supabase start`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Usuarios de prueba (`seed.sql`),
contraseña `ayni-demo-123`: `rosa@ayni.demo` (tesorera), `jorge@ayni.demo`, `lucia@ayni.demo`; grupo `AYNI-DEMO`.

## Migraciones

| Archivo | Contenido |
|---|---|
| `20260924000001_schema.sql` | Tablas, restricciones, índices, trigger de perfil, trigger "un pandero no tiene tesorero" |
| `20260924000002_rls.sql` | RLS en **todas** las tablas, privilegios mínimos, políticas |
| `20260924000003_functions.sql` | RPC `SECURITY DEFINER` + permisos de ejecución |
| `supabase/seed.sql` | Datos de demostración (solo local) |

## Modelo

`profiles` · `groups` (fondo común y pandero) · `group_members` · `wallet_accounts` (solo dirección pública, `TESTNET`) ·
`contributions` · `ledger_entries` · `notifications` · `pandero_turns` · `pandero_rounds` · `pandero_contributions` · `code_attempts`.
Importes en **stroops** (`bigint`); ningún importe usa `numeric`/`float`.

## Seguridad (impuesta en la base de datos)

| Regla | Cómo |
|---|---|
| Cada usuario lee/edita solo su perfil (y no su `user_code`) | política + `GRANT UPDATE (name,email,phone,address)` |
| Los miembros leen sus grupos, miembros y registro; los no miembros no ven nada de un grupo privado | `is_group_member()` en las políticas |
| Los panderos **privados no se pueden enumerar**; solo por código | `groups_select` + `join_group_by_code()` |
| El participante no puede cambiar el monto, quitar miembros, abrir/cerrar ingreso, disponer ni archivar | RPC con `is_group_treasurer()` (excepción `forbidden`) |
| **El creador de un pandero no tiene privilegios** | trigger `enforce_no_pandero_treasurer` + `is_group_treasurer` excluye `kind='pandero'` |
| Nadie escribe directamente en grupos/miembros/ledger/contribuciones | sin `INSERT/UPDATE/DELETE` para `authenticated` |
| Solo el backend registra dinero | `record_contribution`, `record_disposal`, `begin/abort_disposal`, `contribution_due` → solo `service_role` |
| Pagos idempotentes y sin reutilizar hashes | `UNIQUE(stellar_tx_hash)`, `UNIQUE(idempotency_key)`, índice único de `ledger_entries.tx_hash` |
| Doble envío del fondo | candado `disposal_lock_at` (`begin_disposal`) |
| Fuerza bruta de códigos | `code_attempts`: 20 códigos inexistentes / 10 min por usuario |
| `join_group_by_code(code)` | valida longitud (9) y formato, estado, capacidad y membresía previa; crea la membresía |

La `service_role` key solo se usa en `src/lib/supabase/server.ts` (route handlers). Nunca `NEXT_PUBLIC_*`.

## Cómo se probó

`tests/db/*.test.ts` ejecuta **las mismas migraciones** sobre PostgreSQL real (PGlite/WASM) con roles `anon/authenticated/service_role`
y `auth.uid()` emulados: 32 pruebas de RLS, permisos, atomicidad, idempotencia, rate limit, candado de disposición y `seed.sql`.

> ⚠ **No se probó contra un proyecto Supabase real** (sin Docker ni credenciales en el entorno de desarrollo). Auth (GoTrue),
> las cookies SSR y el cliente (`repositories/supabase.ts`) están tipados y compilan, y `buildSnapshot` tiene pruebas, pero el
> recorrido completo del modo `supabase` en el navegador no se ejecutó. Haz `supabase db reset` + un recorrido manual antes de una demo.

## Límites conocidos (MVP)

* **Pandero en modo `supabase`:** se crean, se listan, se unen (con términos) y al completarse pasan a *espera*; **el inicio del juego,
  el cobro por ronda y el abono mensual no están persistidos** (requieren un job programado; las tablas `pandero_*` ya existen).
  Esas transiciones solo se simulan en modo `demo`.
* Las **devoluciones** por recálculo se registran en el ledger; no se envía XLM de vuelta on-chain.
* El contador de recordatorios del agente no se persiste; el texto de los recordatorios es de plantilla (sin IA).
* La confirmación de correo de Supabase Auth está desactivada en `config.toml` para pruebas locales (actívala en producción).
