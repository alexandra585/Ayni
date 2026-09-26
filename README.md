# Ayni: Tesorero Autónomo para la Economía Informal

> **Digitalizando el principio andino de reciprocidad (*"hoy por ti, mañana por mí"*).**  
> Un motor de fideicomiso (*escrow*) y libro mayor transparente diseñado para juntas vecinales, fondos colectivos y panderos (ahorro rotativo / ROSCAs), sustituyendo la figura del tesorero falible por un sistema autónomo, auditable y seguro impulsado por **Stellar** y **Supabase**.

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Stellar](https://img.shields.io/badge/Stellar-Testnet-black?logo=stellar)](https://stellar.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-emerald?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 La Visión

En América Latina y diversas economías emergentes, millones de personas gestionan sus finanzas a través de mecanismos informales: panderos, tandas, polladas, juntas de vigilancia o cuotas escolares. Estos esquemas dependen críticamente de un **tesorero humano**, lo que con frecuencia deriva en:
- Riesgos de impago, demoras injustificadas o malversación de fondos.
- Falta de un registro contable público, inmutable y verificable.
- Fricción social y deterioro de la confianza comunitaria al momento de cobrar.

**Ayni** automatiza la custodia y liquidación de cuotas. Los fondos se reciben en una bóveda neutral, las reglas de distribución se programan de forma transparente y, al cumplirse las condiciones pactadas (meta económica o fecha límite), el sistema transfiere de forma autónoma el dinero al destinatario final o al turno correspondiente del pandero.

---

## 🚀 Características Principales

- **Fideicomiso Automatizado (*Escrow*):** Retención y liberación programada de fondos sin intermediarios discrecionales.
- **Doble Modalidad Operativa:**
  - **Modo Demo (In-Memory):** Permite explorar y probar toda la plataforma, sus 14 modales y flujos sin necesidad de infraestructura externa ni Docker.
  - **Modo Supabase + Stellar:** Autenticación real por cookies SSR, RLS en PostgreSQL y transacciones reales en Stellar Testnet.
- **Registro Mayor Transparente (*Ledger*):** Trazabilidad pública de cada abono, recálculo, liquidación o devolución con enlace directo a hashes on-chain.
- **Seguridad en Profundidad (Zero-Trust):**
  - Todas las operaciones monetarias se calculan en **stroops** (`bigint`), eliminando imprecisiones por coma flotante.
  - El servidor verifica directamente contra Horizon el estado, monto, memo y emisor antes de acreditar cualquier pago.
  - Candado atómico (`begin_disposal`) para impedir ataques de doble desembolso.
  - En los panderos, el creador no cuenta con privilegios de tesorero (garantizado mediante triggers en base de datos).
  - Rate limiting contra ataques de fuerza bruta en los códigos de invitación.
- **Conectividad con Wallets:** Soporte integrado con Freighter Wallet y abstracción extensible `PaymentRail` lista para contratos inteligentes (Soroban).
- **Paridad Visual Rigurosa:** Interfaz responsive fiel al diseño original, adaptada a resoluciones de escritorio y móviles.

---

## 🛠️ Stack Tecnológico y Herramientas

### Frontend & Core
- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router)
- **Biblioteca UI:** [React](https://react.dev/) 19
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) 5.9
- **Estilos:** CSS nativo modular + [Tailwind CSS](https://tailwindcss.com/) v4 (utilizado como sistema de tokens de diseño sin preflight destructivo)
- **Gestión de Estado:** [Zustand](https://github.com/pmndrs/zustand) 5
- **Iconografía:** [Lucide React](https://lucide.dev/)
- **Validación de Esquemas:** [Zod](https://zod.dev/)

### Backend, Datos & Seguridad
- **Base de Datos:** [Supabase](https://supabase.com/) / [PostgreSQL](https://www.postgresql.org/) con Row Level Security (RLS) en todas las tablas
- **Procedimientos Almacenados:** Funciones SQL con privilegios `SECURITY DEFINER` y permisos mínimos
- **Sesiones:** SSR Cookies con protección anti-CSRF y verificación `same-origin`

### Infraestructura Financiera (Web3)
- **Red:** [Stellar Network](https://stellar.org/) (Testnet)
- **SDK:** `@stellar/stellar-sdk` v17
- **Billeteras Web3:** `@stellar/freighter-api` y `@cavos/kit`
- **Servicio de Red:** Stellar Horizon API

### Calidad y Testing
- **Test Runner:** [Vitest](https://vitest.dev/)
- **Base de Datos de Pruebas:** `@electric-sql/pglite` (ejecuta migraciones completas de PostgreSQL en WebAssembly en memoria)
- **Testing Library:** `@testing-library/react` & `@testing-library/jest-dom`
- **Linter & Formatter:** ESLint 9 & Prettier

---

## 📁 Estructura del Proyecto

```plaintext
ayni/
├── docs/                       # Documentación técnica exhaustiva
│   ├── ARCHITECTURE.md         # Arquitectura del sistema, capas y decisiones (ADRs)
│   ├── CODE_REVIEW.md          # Auditoría interna de seguridad y mitigaciones
│   ├── PARITY_MATRIX.md        # Matriz de paridad geométrica y funcional de UI
│   ├── STELLAR_TESTNET.md      # Guía técnica de integración con Stellar Testnet
│   └── SUPABASE.md             # Guía de base de datos, RLS, RPCs y snapshot
├── scripts/                    # Scripts auxiliares (pruebas smoke de Stellar)
├── src/
│   ├── app/                    # Rutas de Next.js (App Router)
│   │   ├── (portal)/           # Rutas privadas (/groups, /forum, /wallet, etc.)
│   │   ├── api/stellar/        # Endpoints del servidor (/config, /contribution, /disposal)
│   │   ├── globals.css         # Estilos globales y tokens visuales
│   │   ├── layout.tsx          # Layout principal de la aplicación
│   │   └── page.tsx            # Landing page institucional
│   ├── components/             # Componentes compartidos y app shell (Navbar, Sidebar, Toast)
│   ├── config/                 # Configuración del entorno y constantes de red
│   ├── domain/                 # Lógica de negocio PURA (cálculos, cuotas, panderos, Zod)
│   ├── features/               # Módulos funcionales de la UI (auth, fund-group, pandero, wallet, modals)
│   ├── fixtures/               # Datos semilla para la ejecución en modo demo
│   ├── lib/                    # Utilidades auxiliares (dinero/stroops, formateo, cliente Supabase)
│   ├── proxy.ts                # Middleware de protección de rutas y sesión SSR
│   ├── repositories/           # Capa de acceso a datos (snapshot builder y cliente Supabase)
│   ├── services/               # Integración financiera (PaymentRail, Horizon, Freighter, Treasury)
│   └── store/                  # Stores globales Zustand (useAyni, useUi)
├── supabase/
│   ├── migrations/             # Migraciones DDL (esquema, RLS, RPCs de seguridad)
│   └── seed.sql                # Datos demo para pruebas locales
├── tests/
│   ├── db/                     # Tests de base de datos con PostgreSQL real (PGlite)
│   ├── domain/                 # Tests unitarios de reglas de negocio
│   ├── stellar/                # Tests de verificación y transacciones en Horizon
│   └── ui/                     # Tests de componentes y flujos de usuario
├── LICENSE                     # Licencia de código abierto MIT
└── package.json                # Definición del proyecto, scripts y dependencias
```

---

## ⚡ Puesta en Marcha

### 1. Prerrequisitos
- **Node.js:** Versión `>= 22.18.0`
- **Gestor de paquetes:** `pnpm` (recomendado) o `npm`

### 2. Instalación
Clona el repositorio e instala las dependencias:

```bash
git clone https://github.com/tu-usuario/ayni.git
cd ayni
pnpm install
```

### 3. Ejecución en Modo Demo (Sin Backend)
El modo demo funciona directamente en memoria con datos de prueba:

```bash
pnpm dev
```
Abre en tu navegador [http://localhost:3000](http://localhost:3000).

---

### 4. Ejecución en Modo Supabase + Stellar (Completo)

1. **Configuración de Variables de Entorno:**
   Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env.local
   ```
   Configura `NEXT_PUBLIC_AYNI_MODE=supabase` y añade tus credenciales de Supabase y de la cuenta Treasury de Stellar Testnet.

2. **Iniciar Base de Datos Local:**
   ```bash
   pnpm exec supabase start
   pnpm exec supabase db reset
   ```

3. **Cargar la Cuenta Treasury de Stellar:**
   Crea y fondea una clave de prueba en Stellar Testnet utilizando Friendbot y configúrala en `STELLAR_TREASURY_SECRET`.

4. **Iniciar la aplicación:**
   ```bash
   pnpm dev
   ```

---

## 🧪 Pruebas y Calidad

El proyecto cuenta con un conjunto integral de pruebas automatizadas:

```bash
# Ejecutar suite de pruebas completa con Vitest
pnpm test

# Verificación de tipos en TypeScript
pnpm typecheck

# Linter de código
pnpm lint

# Smoke test contra Stellar Horizon
pnpm smoke:stellar

# Pruebas en vivo en Stellar Testnet (requiere conexión a internet)
STELLAR_LIVE=1 pnpm test tests/stellar/live
```

---

## ⛓️ Evidencia On-Chain (Stellar Testnet)

Como prueba fehaciente de la integración operativa con la red Stellar, se ejecutó una transacción exitosa en **Stellar Testnet**:

- **Red:** Stellar Testnet
- **Estado:** `Successful`
- **Operación:** Envío de fondos nativos (XLM)
- **Cuenta Origen:** `GCYDGW...GXG4JA`
- **Cuenta Destino:** `GBYZ...3NHK`
- **Transaction Hash:** [`6fcfe0961a0f06528437200618cc53e00add122a3d6e0a47cec189752f134c38`](https://stellar.expert/explorer/testnet/tx/6fcfe0961a0f06528437200618cc53e00add122a3d6e0a47cec189752f134c38)
- **Ledger:** `4869620`
- **Monto:** `1 XLM`
- **Comisión (Fee):** `0.00002 XLM`
- **Tamaño de transacción:** `344 bytes`

---

## 👥 Equipo del Proyecto

- **Alexandra** — *Project Manager & Data/Backend*
- **Erick** — *Frontend & UX/UI*
- **Edson** — *Frontend & UX/UI*
- **Mario Leyser Vilca Zamora** — *IA Engine*

---

## 📄 Licencia

Este proyecto se distribuye bajo los términos de la licencia de código abierto **MIT**. Para más detalles, consulta el archivo [LICENSE](LICENSE).

