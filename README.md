# Ayni

Fondos grupales sin tesorero de confianza: juntas vecinales, comités y panderos. Las cuotas van a una bóveda que nadie puede
tocar antes del cierre. **MVP de hackathon en Stellar Testnet — sin dinero real.**

Migración completa del prototipo `docs/reference/ayni_sidebar_v10.html` a **Next.js 16 (App Router) + React 19 + TypeScript estricto**,
con Supabase (Auth, Postgres, RLS) y pagos XLM en Stellar Testnet (Freighter). El HTML es solo una referencia: la app
funciona igual si lo borras (no se sirve, ni en `iframe`, ni con `dangerouslySetInnerHTML`, ni con `fetch`).

## Inicio rápido (modo demo, sin backend)

```bash
pnpm install
pnpm dev            # http://localhost:3000  → "Abrir mis grupos" → crea una cuenta de ejemplo
```

Node ≥ 22.18 y pnpm. En modo demo todo vive en memoria (se reinicia al recargar), igual que el prototipo.

## Modo conectado (Supabase + Stellar Testnet)

1. `cp .env.example .env.local` y `NEXT_PUBLIC_AYNI_MODE=supabase`.
2. Base de datos: `pnpm exec supabase start && pnpm exec supabase db reset` → ver [`docs/SUPABASE.md`](docs/SUPABASE.md).
3. Stellar: crea y fondea una cuenta treasury de Testnet → [`docs/STELLAR_TESTNET.md`](docs/STELLAR_TESTNET.md).
4. Instala **Freighter**, ponlo en **Testnet**, entra con `rosa@ayni.demo` / `ayni-demo-123` y paga tu cuota.

### Variables (`.env.example`, sin secretos)

| Variable | Dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_AYNI_MODE` | cliente | `demo` (defecto) · `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente | públicas por diseño (RLS protege) |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | jamás `NEXT_PUBLIC_*`; registra pagos verificados |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | cliente/servidor | debe ser Testnet; otra red se rechaza |
| `STELLAR_TREASURY_SECRET` | **solo servidor** | secret de la treasury de Testnet |

## Scripts

```bash
pnpm lint         # ESLint (next + react-hooks estrictas)
pnpm typecheck    # tsc --noEmit (strict)
pnpm test         # Vitest: dominio, store, UI, Postgres real (PGlite), Stellar
pnpm build        # next build
pnpm smoke:stellar                           # (internet) muestra una transacción real de Testnet
STELLAR_LIVE=1 pnpm test tests/stellar/live  # (internet) integración contra Testnet
```

## Rutas

`/` · `/login` · `/groups` · `/groups/new` · `/groups/join` · `/groups/[groupId]` · `/groups/[groupId]/created` · `/forum` ·
`/wallet` · `/notifications` · `/profile` · API: `/api/stellar/config`, `/contribution`, `/disposal`.

## Estructura

```
src/app          rutas + api/stellar
src/features     auth · groups · fund-group · pandero · wallet · profile · notifications · ledger · demo · modals · landing
src/components   ui/ (Icon, Badge, Sheet, Toast) · layout/ (Sidebar, PortalShell, LandingNav, Providers)
src/domain       reglas puras + validación Zod (sin React, sin Supabase)
src/store        Zustand: useAyni (dominio) · useUi (modal/toast/sesión)
src/repositories snapshot.ts (SQL→UI) · supabase.ts
src/services     payment-rail.ts · stellar/{verify,horizon,treasury,freighter,rail}
src/fixtures     demo/seed.ts
supabase/        migrations + seed.sql + config.toml
tests/           domain · store · ui · db (Postgres real) · stellar · repositories · lib
docs/            PARITY_MATRIX · ARCHITECTURE · SUPABASE · STELLAR_TESTNET · DEPLOY_CHECKLIST · INCIDENT_RUNBOOK · CODE_REVIEW · reference/
```

## Funcionalidades completas

* **Paridad con el prototipo:** landing, onboarding, sidebar, Mis grupos, Crear grupo (fondo común 4 pasos / pandero 3), Unirme
  (`AYNI-XXXX` de 9 caracteres), vista del tesorero con Panel superpuesto, 6 estados del Pandero, Foro, Billetera, Perfil, Notificaciones,
  14 diálogos y **Modo demo** flotante funcional (fondo común y pandero). Ver [`docs/PARITY_MATRIX.md`](docs/PARITY_MATRIX.md).
* **Supabase:** Auth, esquema, RLS, RPC (`create_group`, `join_group_by_code`, `apply_change`, …), ledger, notificaciones, wallet (solo dirección).
* **Stellar Testnet:** conexión Freighter, pago XLM con memo del grupo, **verificación en el servidor**, hash registrado en el ledger,
  disposición del fondo desde la treasury con candado anti doble envío.

## Limitaciones conocidas

* **No se ejercitó** el modo `supabase` de punta a punta en el navegador ni Freighter real (faltaba Docker/credenciales/extensión).
  Sí están probados: la base de datos con Postgres real, la verificación de Stellar contra **Testnet real** y los *route handlers*.
* Pandero en modo `supabase`: creación/unión sí; **inicio del juego, cobro por ronda y abono mensual no están persistidos** (solo simulados en demo).
* Devoluciones por recálculo: solo ledger, no on-chain. Recordatorios del agente: plantilla, sin IA.
* Aceptado por paridad con el prototipo: algunos botones (44 px) y textos (13–14 px) no alcanzan los mínimos 48 px / 16 px del brief.
* **Solo Testnet.** Producción exige custodia/contratos, auditoría y cumplimiento (ver `docs/STELLAR_TESTNET.md`).

## Solución de problemas

* `ERR_PACKAGE_IMPORT_NOT_DEFINED` / `spawn … esbuild.exe ENOENT` al correr Vitest **dentro de una carpeta virtualizada de Windows (MSIX, `AppData\Local\Packages\…`)**:
  mueve el proyecto a una carpeta normal, o define `ESBUILD_BINARY_PATH` a una copia de `esbuild.exe` fuera de esa ruta.
* `stellar-sdk` con Node ≥ 22 puede dar `ERR_REQUIRE_CYCLE_MODULE` si Node lo carga nativamente; Next lo empaqueta y Vitest lo transforma (`vitest.config.ts`).
