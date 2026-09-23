# Ayni: Tesorero Autónomo para la Economía Informal

## La Visión
Ayni digitaliza el principio andino de reciprocidad ("hoy por ti, mañana por mí"). Es un motor de fideicomiso (escrow) automatizado diseñado para juntas vecinales, fondos escolares y panderos. Reemplaza la figura del tesorero humano falible por un agente incorruptible que custodia fondos y audita pagos.

## La Solución (MVP Track 1)
Los usuarios se unen a "grupos silenciosos" mediante un enlace de invitación. Tras validar su ingreso, depositan su cuota en una bóveda neutral. El agente asume el rol de administrador absoluto: retiene el dinero y, al cumplirse la meta o la fecha, lo transfiere automáticamente al destinatario final (el vigilante, la agencia de viajes, etc.).

## Stack Tecnológico (Version 1)
* **Autenticación sin fricción:** Privy / Cabos para la generación transparente de wallets.
* **Infraestructura Financiera:** Red Stellar (Testnet) para la custodia de fondos (USDC) y liquidaciones casi instantáneas.
* **Cerebro Autónomo:** Implementación del estándar X-402 (Agents and Payments) para otorgar permisos al agente de Python, permitiéndole ejecutar las transacciones basadas en reglas de negocio procesadas con Pandas.

## El Equipo y División de Tareas

* **Alexandra** - Project Manager & Data/Backend.
* **Erick** - Frontend & UX/UI.
* **Edson** - Frontend & UX/UI.
* **Leyser** - Infraestructura Web.
