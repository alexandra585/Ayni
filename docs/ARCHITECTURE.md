# Arquitectura de Ayni

**Modular monolith** en Next.js (App Router). Sin microservicios, colas ni infraestructura extra.

```
UI React (features/*, components/*)
   │  hooks / acciones del store
   ▼
Store Zustand  ─── implementación "DemoRepository" (memoria) ──► domain/ (reglas puras, testeadas)
   │
   └── modo supabase ──► repositories/supabase.ts ──► Supabase (RLS + RPC)
                          services/payment-rail.ts ──► StellarTestnetRail ──► Freighter · /api/stellar/* · Horizon
```

## Capas

| Capa | Carpeta | Responsabilidad | Depende de |
|---|---|---|---|
| Rutas | `src/app` | Rutas reales (`/`, `/login`, `/groups…`, `/forum`, `/wallet`, `/notifications`, `/profile`) y `api/stellar/*` | features |
| UI | `src/features/*`, `src/components/*` | Pantallas y modales del prototipo (JSX + clases CSS del prototipo) | store, domain (solo lectura), services |
| Dominio | `src/domain` | Reglas de negocio **puras**: cuotas, recálculo, cierre, pandero, validación (Zod). Azar/tiempo inyectables (`env.ts`) para pruebas deterministas | `lib/format` |
| Estado | `src/store` | `useAyni` (dominio + acciones), `useUi` (modal, toast, sesión). El store clona el estado, aplica una regla del dominio y publica | domain, repositories |
| Repositorios | `src/repositories` | `snapshot.ts` (filas SQL → estado de la UI, puro) y `supabase.ts` (lecturas con RLS + RPC) | lib/supabase |
| Servicios | `src/services` | `payment-rail.ts` (interfaz `PaymentRail`), `stellar/*` (verificación, Horizon, Freighter, treasury) | stellar-sdk |
| Datos demo | `src/fixtures/demo` | Semilla explícita (7 grupos, foro, billetera, notificaciones) | domain |
| Base de datos | `supabase/` | Migraciones (esquema, RLS, RPC) y `seed.sql` | – |

**Regla:** los componentes no conocen `@supabase/*` ni `@stellar/*`. Ejemplo: `PayModal → useRail() → PaymentRail.payContribution() → (Demo | StellarTestnet)`.

## Modos

`NEXT_PUBLIC_AYNI_MODE`:

* `demo` (por defecto): todo en memoria, idéntico al prototipo (se reinicia al recargar). No requiere backend.
* `supabase`: Auth real, datos en Postgres con RLS y pagos XLM en Stellar **Testnet**.

La UI es la misma en ambos: en modo `supabase` el store se *hidrata* con `loadSnapshot()` (`buildSnapshot` convierte stroops→XLM) y cada escritura llama a una RPC y recarga.

## Flujo de un pago (modo supabase)

```
Pagar ─► GET /api/stellar/contribution?groupId   (monto exacto que decide la BD)
      ─► Freighter firma un pago XLM → treasury (memo AYNI:<grupo>)  ─► Horizon Testnet ─► hash
      ─► POST /api/stellar/contribution {groupId, txHash}
            · sesión (cookies SSR) + same-origin
            · Horizon: red=Testnet, éxito, destino=treasury, emisor=wallet registrada, monto exacto, memo del grupo
            · RPC record_contribution (service_role): contribución + miembro + ledger + notificación, atómico e idempotente
      ─► la UI recarga el snapshot
```

## Decisiones (ADR)

### ADR-001 — CSS del prototipo copiado; Tailwind solo para tokens
*Contexto:* el brief exige paridad visual total con el HTML. *Decisión:* `globals.css` contiene el CSS del prototipo literalmente; Tailwind v4 se importa **sin preflight** (el prototipo depende de los estilos por defecto del navegador, p. ej. el peso de `h1–h3`) y solo expone los tokens como utilidades. *Consecuencia:* paridad medible (huellas de DOM idénticas); a cambio no se usan utilidades Tailwind en los componentes migrados.

### ADR-002 — Store en memoria como "DemoRepository" y snapshot para Supabase
*Contexto:* 14 modales y ~40 acciones con lógica cruzada (notificaciones, devoluciones, débito automático). *Decisión:* las reglas viven en `domain/` (puras, mutan un borrador) y el store las aplica sobre un clon. En modo `supabase` la BD es la fuente de verdad y la UI se alimenta con un snapshot. *Alternativa descartada:* reescribir cada acción de UI contra una interfaz de repositorio asíncrono (mucho más código y riesgo de romper la paridad). *Consecuencia:* el modo `supabase` cubre el subconjunto P0 (ver `docs/SUPABASE.md`, "Límites conocidos").

### ADR-003 — Reglas en la base de datos, dinero en stroops
*Decisión:* toda mutación pasa por funciones `SECURITY DEFINER` que validan el rol; los clientes solo tienen `SELECT`. Importes `bigint` en stroops (`1 XLM = 10,000,000`); la UI convierte a XLM. *Consecuencia:* ocultar botones no es la defensa; probado con Postgres real (PGlite) en `tests/db`.

### ADR-004 — El servidor verifica; el navegador nunca decide
*Decisión:* el registro de un pago exige que el servidor consulte Horizon y compare todo (`services/stellar/verify.ts`); `record_contribution/record_disposal` solo los puede ejecutar `service_role`. *Consecuencia:* un hash falsificado o reutilizado no acredita nada.

### ADR-005 — Stellar Testnet con treasury de servidor (MVP), no Soroban
*Decisión:* pagos XLM directos a una cuenta treasury de **Testnet** y disposición desde esa cuenta, tras un candado atómico en BD. *No es custodia de producción:* ver `docs/STELLAR_TESTNET.md` para lo que exigiría Mainnet (contrato/bóveda, auditoría, cumplimiento). La interfaz `PaymentRail` permite sustituirlo por un `SorobanVaultRail`.

## Rutas

| Ruta | Pantalla |
|---|---|
| `/` | Landing |
| `/login` | Crear cuenta (demo) / Entrar (Supabase) |
| `/groups` | Mis grupos |
| `/groups/new` | Crear nuevo grupo (wizard) |
| `/groups/join` | Unirme a un grupo |
| `/groups/[groupId]` | Fondo común (tesorero/participante) o Pandero |
| `/groups/[groupId]/created` | Confirmación tras crear |
| `/forum` | Foro de panderos |
| `/wallet` | Billetera |
| `/notifications` | Notificaciones (página; también diálogo desde la barra) |
| `/profile` | Perfil |
| `/api/stellar/config` · `/contribution` · `/disposal` | Servidor: configuración pública, verificación de pagos, disposición del fondo |
