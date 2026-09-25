# Stellar Testnet — MVP TESTNET ONLY

> **Alcance:** demostración de hackathon en la red de pruebas. **No hay dinero real, ni Mainnet, ni custodia de producción.**
> El código se niega a operar contra Horizon que no sea de Testnet (`assertTestnetUrl`, `assertHorizonIsTestnet`).

## Qué está implementado

| Paso | Dónde | Estado |
|---|---|---|
| Conectar wallet (Freighter), leer dirección, exigir red Testnet | `services/stellar/freighter.ts` | ✅ implementado · ⚠ no ejercitado con la extensión real |
| Leer saldo (Horizon) | `services/stellar/horizon.ts` `fetchXlmBalance` | ✅ |
| Firmar y enviar un pago XLM → treasury (memo del grupo) | `freighter.ts` `signAndSubmitPayment` | ✅ implementado · ⚠ requiere Freighter |
| **Verificar en el servidor** y registrar hash + ledger | `app/api/stellar/contribution` + `verify.ts` + RPC `record_contribution` | ✅ probado (unit + **Testnet real**) |
| **Disposición** treasury → wallet del destino con candado y registro | `app/api/stellar/disposal` + `treasury.ts` + RPC `record_disposal` | ✅ probado (unit + **Testnet real**) |
| Movimiento visible en "Registro transparente" (con hash) | `ledger_entries` → UI | ✅ |

## Qué verifica el backend antes de registrar (nunca confía en el navegador)

1. Sesión válida (cookies SSR) y **mismo origen** (anti-CSRF).
2. El **monto lo decide la base de datos** (`contribution_due`): cuota − abonado.
3. Horizon = Testnet (`network_passphrase`).
4. La transacción **existe y fue exitosa**.
5. **Memo** = `AYNI:<22 hex del grupo>` → un pago para un grupo no sirve para otro.
6. Exactamente **un** pago **XLM nativo** al **treasury** (derivado de `STELLAR_TREASURY_SECRET` en el servidor).
7. **Monto exacto** (comparación en stroops, sin flotantes).
8. **Emisor** = la wallet registrada del usuario (si ya registró una).
9. El **hash no se ha registrado antes** (`UNIQUE` en BD; reintentos con el mismo hash son idempotentes).

## Cuenta treasury (solo demo)

```bash
node -e "const {Keypair}=require('@stellar/stellar-sdk');const k=Keypair.random();console.log(k.publicKey(),k.secret())"
curl "https://friendbot.stellar.org/?addr=<PUBLIC>"      # la fondea con XLM de prueba
```

Guarda la **secret** únicamente en `STELLAR_TREASURY_SECRET` (variable privada del servidor). Jamás `NEXT_PUBLIC_*`, jamás en el cliente ni en el repositorio.
`NEXT_PUBLIC_STELLAR_TREASURY_PUBLIC` es opcional (el cliente lee la dirección desde `/api/stellar/config`).

Para probar como usuario: instala Freighter, cámbialo a **Testnet**, fondea tu cuenta con Friendbot (la pantalla Billetera tiene el botón) y paga tu cuota.

## Pruebas

```bash
pnpm test                       # verificación con la respuesta REAL de Horizon guardada como fixture + route handlers
STELLAR_LIVE=1 pnpm test tests/stellar/live   # integración contra Testnet real (requiere internet)
pnpm smoke:stellar              # imprime la forma real de una transacción de Testnet
```

La prueba en vivo crea cuentas nuevas con Friendbot, hace un pago con memo, lo verifica con el código de producción
(`fetchTxAndOps` + `verifyPayment`) y ejecuta `sendFromTreasury`.

## Lo que Mainnet exigiría (fuera de alcance, documentado a propósito)

* **Custodia:** una treasury controlada por el servidor es un punto único de fallo y de confianza. Producción requiere una bóveda
  on-chain (contrato **Soroban** con reglas de cierre/fecha, o cuentas multisig) y gestión de claves (HSM/KMS). La interfaz
  `PaymentRail` (`getBalance/payContribution/releaseFund`) permite añadir un `SorobanVaultRail` sin tocar la UI.
* **Reembolsos on-chain** por recálculo de cuotas (hoy solo se registran en el ledger).
* **Débito automático del pandero** (autorización recurrente / cuenta programable con passkey).
* **Concilación** de envíos huérfanos (si el envío sale y el registro falla, el API devuelve el hash para conciliar manualmente).
* **Cumplimiento** (SBS/UIF en Perú), términos, KYC/AML, revisión de seguridad y auditoría de contratos.
* Comisiones de red pagadas por Ayni (*fee bump*), monitoreo, alertas y límites por transacción.
