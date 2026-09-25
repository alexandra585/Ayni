# Revisión de código (seguridad, corrección, rendimiento)

Revisión propia del código antes de la entrega, con foco en dinero, permisos y estado. Cada hallazgo tiene su estado y, cuando
aplica, la prueba que lo cubre.

## Corregidos durante la revisión

| # | Sev | Hallazgo | Corrección | Prueba |
|---|---|---|---|---|
| 1 | Alta | Doble envío del fondo: dos peticiones simultáneas a `/api/stellar/disposal` podían enviar XLM dos veces | Candado atómico `begin_disposal` (2 min) antes de enviar; `abort_disposal` si el envío falla | `tests/db` (candado) · `tests/stellar/disposal-route` |
| 2 | Alta | El usuario podía pagar on-chain un monto que luego el servidor rechazaba (fondos "atrapados") | El cliente pide el monto exacto al servidor (`GET /contribution`) antes de firmar | `tests/stellar/routes` |
| 3 | Media | Reintento tras corte de red con el mismo hash devolvía `nothing_due` aunque el pago ya estaba registrado | Idempotencia en la ruta y en `record_contribution` (mismo hash+usuario+grupo → `duplicate:true`) | `routes.test` · `rls.test` |
| 4 | Media | Fuerza bruta de códigos `AYNI-XXXX` (≈ 923k combinaciones) | `code_attempts`: 20 inexistentes / 10 min por usuario (`rate_limited`) | `rls.test` |
| 5 | Media | CSRF en endpoints que usan sesión por cookies | Comprobación same-origin en los `POST` + cookies SameSite=Lax de Supabase | `routes.test` · `disposal-route.test` |
| 6 | Media | El proxy fallaba con 500 si Supabase no respondía | Falla **cerrada**: sin respuesta = sin sesión (redirige a `/login`) | verificado con `next start` sin Supabase |
| 7 | Media | Carrera de UI: el rail de pagos real se cargaba de forma asíncrona y por unos ms se podía usar el simulado | `getPaymentRail()` es síncrono según el modo | tipos + revisión |
| 8 | Baja | Heurística frágil para "mis movimientos" (por nombre) | Se usa `actor_id` | `snapshot.test` |
| 9 | Baja | Textos "pago simulado" visibles en modo real | Landing/términos/pago/billetera cambian según el modo | revisión |
| 10 | Baja | Cabeceras de seguridad ausentes | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, sin `X-Powered-By` | `curl -i` |

## Verificado sin hallazgos

* **RLS/permisos** (Postgres real): un no miembro no lee nada de un grupo privado; el participante no puede cambiar el monto, quitar miembros,
  cambiar el ingreso, agregar, archivar ni disponer; nadie escribe directo en `groups/group_members/ledger/contributions`; solo `service_role`
  ejecuta `record_*`; el creador de un pandero no tiene privilegios (trigger).
* **Dinero:** todo en `bigint` stroops en BD y en las verificaciones; `xlmToStroops` rechaza >7 decimales y no usa flotantes; comparación exacta del monto on-chain.
* **Verificación de Stellar:** red Testnet, éxito, memo del grupo, un solo pago XLM al treasury, emisor = wallet registrada, hash único.
  Contrastada con la respuesta **real** de Horizon (fixture) y con una prueba en vivo en Testnet.
* **Secretos:** `STELLAR_TREASURY_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` solo se leen en `src/lib/supabase/server.ts` y `src/services/stellar/treasury.ts`
  (rutas de servidor); ninguna con prefijo `NEXT_PUBLIC_`. No hay `dangerouslySetInnerHTML`, `iframe` ni `innerHTML` en `src/`.
* **Open redirect:** `?next=` solo acepta rutas internas.
* **XSS:** React escapa todo; los mensajes de recordatorio se muestran como texto.

## Abiertos / riesgos aceptados (MVP)

| Sev | Riesgo | Mitigación / plan |
|---|---|---|
| Alta (producción) | La treasury es una cuenta controlada por el servidor: punto único de confianza y de fallo | **Solo Testnet.** Producción: bóveda Soroban/multisig + KMS/HSM (ver `STELLAR_TESTNET.md`) |
| Media | Si el envío del fondo sale y el registro falla dos veces, requiere conciliación manual | El API devuelve el hash; runbook en `INCIDENT_RUNBOOK.md` |
| Media | Sin CSP (Next dev/HMR y Google Fonts la complican) | Añadir CSP con nonce antes de producción |
| Media | Modo `supabase` sin recorrido E2E en navegador ni Freighter real | Ver `SUPABASE.md` / `README` (limitaciones) |
| Baja | Los diálogos no atrapan el foco (igual que el prototipo) | Añadir *focus trap* si se prioriza accesibilidad sobre paridad |
| Baja | Los mínimos de 48 px / 16 px del brief no se cumplen en algunos botones/textos porque el prototipo (fuente de verdad) usa 44 px / 13–14 px | Decidir con diseño si se ajusta el prototipo |
| Baja | `select *`/`limit` sin paginar en `loadSnapshot` (1000 movimientos, 200 notificaciones) | Paginación si crece el volumen |
| Baja | React Query está configurado pero el MVP carga datos con un snapshot en el store | Migrar lecturas a `useQuery` si se necesita caché/refetch |
