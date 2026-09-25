# Checklist de despliegue (demo de hackathon en Testnet)

> Marca cada punto antes de publicar. Todo es **Testnet**: nunca uses claves ni fondos reales.

## 1. Código y calidad
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde en CI y en limpio (`pnpm install --frozen-lockfile`).
- [ ] `STELLAR_LIVE=1 pnpm test tests/stellar/live` en verde (opcional, requiere internet).
- [ ] Sin `console.log` de datos sensibles; sin secretos en el repo (`git grep -nE "S[A-Z2-7]{55}|service_role"`).
- [ ] `docs/reference/*.html` no se sirve (no está en `/public`); la app funciona sin él.

## 2. Supabase
- [ ] Proyecto creado; migraciones aplicadas **en orden** (`supabase db push`). **No** aplicar `seed.sql` en producción (usuarios de prueba).
- [ ] RLS activo en todas las tablas: `select tablename from pg_tables where schemaname='public' and not rowsecurity;` → vacío.
- [ ] Confirmación de correo **activada** en Auth; URL del sitio y redirecciones correctas; *rate limits* de Auth revisados.
- [ ] `anon` no ejecuta RPC de negocio; `record_*`/`begin_disposal` solo `service_role` (`\df+` / prueba `tests/db`).
- [ ] Copia de seguridad / PITR habilitado; alguien sabe restaurarla.

## 3. Variables de entorno (en el proveedor, no en el repo)
- [ ] `NEXT_PUBLIC_AYNI_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` y `STELLAR_TREASURY_SECRET` marcadas como **secretas / solo servidor**; ninguna con prefijo `NEXT_PUBLIC_`.
- [ ] `NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`.
- [ ] Treasury de Testnet **fondeada** (Friendbot) y con saldo para las disposiciones de la demo.

## 4. Verificación tras desplegar (humo)
- [ ] `GET /api/stellar/config` devuelve `network: TESTNET` y la dirección pública de la treasury (nunca la secret).
- [ ] Registro/inicio de sesión funcionan; rutas del portal redirigen a `/login` sin sesión.
- [ ] Freighter en **Testnet**: conectar wallet → pagar cuota → aparece el hash en "Registro transparente".
- [ ] Repetir el mismo pago/hash → no duplica (idempotente). Un hash inventado → rechazado.
- [ ] Como participante: el Panel del tesorero no aparece y `apply_change` devuelve `forbidden`.
- [ ] Disposición: solo con el grupo en "listo"; segundo clic simultáneo → 409.

## 5. Disparadores de reversión (decídelos antes)
Revertir el despliegue (o poner `NEXT_PUBLIC_AYNI_MODE=demo`) si ocurre cualquiera:
- [ ] Un pago se acredita sin verificación o con monto distinto al de la cuota.
- [ ] Un usuario lee datos de un grupo del que no es miembro.
- [ ] La treasury envía más de una vez el fondo de un mismo grupo.
- [ ] La secret o la service-role key aparece en el bundle del cliente / logs.
- [ ] Errores 5xx > 5 % en `/api/stellar/*` durante 10 minutos.

## 6. Comunicación
- [ ] Banner/mensaje visible: "**Demo en Stellar Testnet — no se mueve dinero real**".
- [ ] Persona de guardia y canal definidos (ver `INCIDENT_RUNBOOK.md`).
