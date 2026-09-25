# Runbook de incidentes

Aplica al despliegue de demo (Testnet). La regla de oro: **ante la duda, contener primero** (poner la app en modo demo o pausar
`/api/stellar/*`) y preguntar después.

## Severidad

| Sev | Ejemplo | Respuesta |
|---|---|---|
| **SEV1** | Fuga de la `STELLAR_TREASURY_SECRET` o de la service-role key · usuario ve datos de otro grupo · pagos acreditados sin verificar | Contener de inmediato (abajo), avisar a todos, post-mortem |
| **SEV2** | Doble envío del fondo · pagos verificados pero no registrados (hash huérfano) · Horizon caído durante la demo | Contener el flujo afectado, conciliar |
| **SEV3** | Error visual, notificación duplicada, un usuario no puede entrar | Ticket normal |

## Contención rápida

| Situación | Acción |
|---|---|
| Secret de la treasury expuesta | Rotar: crear otra cuenta Testnet, mover el saldo, actualizar `STELLAR_TREASURY_SECRET`, redeploy. Es Testnet: el impacto es de reputación, no monetario |
| Service-role key expuesta | Rotar en Supabase (Settings → API), actualizar el entorno, redeploy, revisar `ledger_entries`/`contributions` de las últimas horas |
| Fuga entre grupos (RLS) | Poner `NEXT_PUBLIC_AYNI_MODE=demo` (deja de leer/escribir datos reales), revisar políticas y ejecutar `tests/db` |
| Pago verificado sin registro (API devolvió `record_failed` o timeout) | El hash está en la respuesta/log. Reintentar `POST /api/stellar/contribution` con el mismo `txHash` (es idempotente). Si falla, insertar con `record_contribution` (service_role) |
| Disposición enviada sin registro | Localizar el hash en la respuesta `record_failed`; ejecutar `record_disposal` con ese hash. **No reenviar** antes de comprobar en un explorador que el pago existe |
| Candado de disposición atascado | Caduca solo a los 2 min; para liberar: `select public.abort_disposal('<group>')` (service_role) |
| Horizon caído | Los pagos no pueden verificarse: mostrar el aviso y esperar; nada se acredita sin verificación (comportamiento correcto) |

## Comunicación (plantilla)

> **[SEV?] Ayni — <resumen en una línea>** · Inicio: <hora> · Impacto: <quién/qué> · Estado: investigando/contenido/resuelto ·
> Próxima actualización: <hora>. Recordatorio: es una demo en Testnet, no hay fondos reales en riesgo.

## Post-mortem (sin culpas)

1. **Resumen** y línea de tiempo (detección → contención → resolución).
2. **Impacto** (usuarios, datos, dinero de prueba).
3. **Causa raíz** y por qué las defensas no lo evitaron (¿qué prueba faltaba en `tests/`?).
4. **Qué salió bien / mal / suerte.**
5. **Acciones** con responsable y fecha (siempre incluir una prueba nueva que reproduzca el fallo).
