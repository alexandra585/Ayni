# Matriz de paridad — `ayni_sidebar_v10.html` → Next.js

> **Fuente de verdad:** [`docs/reference/ayni_sidebar_v10.html`](reference/ayni_sidebar_v10.html).
> El brief menciona `v11`, pero el archivo entregado es **v10** (1755 líneas); esa es la referencia usada.
> Leyenda: ✅ completo · ⚠ parcial · ❌ ausente · ➖ no aplica (ver notas).

## Cómo se verificó (no es "se parece")

| Verificación | Resultado |
|---|---|
| **Texto**: se ejecutó el mismo recorrido de clics en el HTML y en la app React y se comparó `innerText` normalizado de 25 pantallas/estados/modales | 25/25 idénticos (solo difieren valores aleatorios: dirección Stellar, códigos) |
| **Geometría**: huella de *todos* los elementos visibles (etiqueta, clase, x, y, ancho, alto) en 11 pantallas/modales, en **1440×900** y en **390×844** | 21 de 22 idénticas al píxel; la restante (modal "Recargar", 1440×900) difiere 4 px en el ancho de un texto porque ambas apps generan una dirección Stellar aleatoria distinta |
| **CSS**: `src/app/globals.css` es el CSS del prototipo copiado literalmente (solo se adaptaron 10 selectores `body[data-page…]` → `#app[data-auth]`) | mismos tokens, colores, tipografías, radios, breakpoints |
| **Lógica**: las reglas del HTML se portaron a funciones puras (`src/domain`) y se prueban en `tests/domain`, `tests/store` y `tests/ui` | `pnpm test` |

## 1. Landing (`/`)

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| Landing | Nav: marca, "Cómo funciona", "Pagos y wallets", "Abrir mis grupos" | ✓ | ✓ | ✓ | ✓ | ✅ | scroll suave a secciones; desde otras rutas navega a `/#id` |
| Landing | Nav con sesión: campana con contador + chip de usuario | ✓ | ✓ | ✓ | ✓ | ✅ | la campana abre el diálogo de notificaciones |
| Landing | Hero (patrón, título, lede, "Crear un grupo", "Ver cómo funciona") | ✓ | ✓ | ✓ | ✓ | ✅ | "Crear un grupo" → `/groups/new` (pide cuenta si no hay sesión y vuelve) |
| Landing | Bóveda de ejemplo (2,300 XLM · 77 %) | ✓ | ✓ | ✓ | – | ✅ | estática, igual que el prototipo |
| Landing | 7 pasos, "Para quién" (3 casos), "Por qué confiar" (4 checks), tabla de wallets, CTA, footer | ✓ | ✓ | ✓ | – | ✅ | el icono `eye` no existe en el mapa de iconos del HTML: se conserva vacío (paridad) |

## 2. Acceso (`/login`)

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| Onboarding | Nombre, correo, celular, dirección, "Crear cuenta con mi huella" | ✓ | ✓ | ✓ | ✓ | ✅ | validación Zod con los mismos mensajes; siembra los grupos de ejemplo |
| Onboarding | Errores (nombre < 3, correo inválido, celular inválido) + foco al campo | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Acceso real | Correo + contraseña (Supabase Auth) | ➖ | ✓ | ✓ | ✓ | ✅ | solo `NEXT_PUBLIC_AYNI_MODE=supabase`; reutiliza el diseño del onboarding |
| Portal | Redirección a `/login?next=…` sin sesión y regreso tras entrar | ➖ | ✓ | – | ✓ | ✅ | solo rutas internas (`safeNext`, sin *open redirect*) |

## 3. Barra lateral y app shell

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| Sidebar | Logo (vuelve a la landing), título "Navegación" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Sidebar | Grupos ▸ Mis grupos / Crear nuevo grupo / Unirme a un grupo (expandible, activos) | ✓ | ✓ | ✓ | ✓ | ✅ | el subnav solo existe dentro de `/groups*` (en el HTML está oculto fuera) |
| Sidebar | Foro de panderos, Billetera, Perfil (estado activo) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Sidebar | Notificaciones + badge de no leídas (9+) | ✓ | ✓ | ✓ | ✓ | ✅ | abre el diálogo; `/notifications` es el mismo listado como página |
| Sidebar | Tarjeta de usuario + "Cerrar sesión" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Sidebar | Responsive (barra superior ≤ 900 px, 2 columnas ≤ 640 px) | ✓ | ✓ | ✓ | ✓ | ✅ | verificado a 390×844 |
| Shell | Sin contenedor global (`container`, `max-w-*`, `mx-auto`) | ✓ | ✓ | ✓ | – | ✅ | los anchos máximos son por pantalla (`.junta-page` 960 px, etc.) |
| Toast | 3 s, `role=status` | ✓ | ✓ | ✓ | ✓ | ✅ | |

## 4. Mis grupos / Crear / Unirme

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| `/groups` | Tarjetas (naturaleza, nombre, estado, etiqueta Tesorero/Participante/Público/Privado), estado vacío, nota de modo demo | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/new` | Paso 1: **solo dos opciones** (Grupo con fondo común · Pandero) + nombre | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/new` | Fondo común: naturaleza (5 opciones), monto, fecha límite; **sin campo "Periodo"** | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/new` | Regla de cierre (fecha / meta) y participantes con cuota en vivo; barra de pasos 4/3 | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/new` | Pandero: aporte, participantes (2–50), visibilidad, resumen + términos + aceptación | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/new` | Errores por paso, "Atrás/Cancelar", foco en el error | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/[id]/created` | "Reglas bloqueadas", código grande, copiar invitación, ir al grupo, ver en foro | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/groups/join` | Código `AYNI-XXXX` **exactamente 9 caracteres** (no acepta solo 4), errores claros | ✓ | ✓ | ✓ | ✓ | ✅ | además valida el formato `AYNI-[A-Z0-9]{4}` |
| `/groups/join` | Códigos de prueba (5B32, C7LM, P8RV), ingreso cerrado, grupo lleno, ya miembro, pandero → términos | ✓ | ✓ | ✓ | ✓ | ✅ | |

## 5. Grupo con fondo común — vista del tesorero (P0)

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| `/groups/[id]` | Cabecera (chip de rol, nombre, periodo/cuota/vencimiento, "Descargar reporte" CSV) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | Invitación arriba + "Copiar invitación" + acceso **Panel del tesorero** (solo tesorero en custodia) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | Tarjeta de estado: fondo reunido, meta, %, barra, "N de M ya pagaron", protección, cuenta regresiva, ayuda | ✓ | ✓ | ✓ | ✓ | ✅ | textos según estado (custodia / listo / liberado) |
| | Recordatorios: botón, "Preparando…", mensajes, copiar, "Marcar como enviados" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | "Tu cuota": pagar / completar / completa | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | Disposición: "Recolectar en mi wallet", "Enviar a un participante" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | Ciclo finalizado: "Archivar grupo" / "Iniciar nuevo ciclo" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | Miembros: chips de filtro con contadores, estados, "Quitar" (tesorero), "Ver más (N)" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| | Registro transparente por día, comprobante, "Ver registro completo" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Panel del tesorero (monto, ingreso abierto, agregar por código, ejemplo demo) — **superpuesto**, no bajo el historial | ✓ | ✓ | ✓ | ✓ | ✅ | un no-tesorero no lo ve (UI) ni lo puede ejecutar (RLS/RPC) |
| Modal | Cambiar monto (aviso, comparación antes→después, impacto) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Quitar miembro (dejar lugar libre / quitar lugar, impacto, devoluciones) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Agregar un cupo (grupo lleno → recalcula) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Enviar a un participante + Confirmar | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Pagar mi cuota: formulario, saldo insuficiente → recargar, procesando (3 pasos), comprobante | ✓ | ✓ | ✓ | ✓ | ✅ | vía `PaymentRail` |
| Modal | Registro completo | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modo demo | "Simular que alguien se une" · "Simular pago de otro miembro" · "Simular que llegó la fecha de cierre" | ✓ | ✓ | ✓ | ✓ | ✅ | actualizan miembros, contador, progreso, ledger, cierre y botones; a los 700 ms pasa a "listo" |

## 6. Pandero

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| Cabecera | Chips (público/privado, creador/participante, débito automático, ejemplo), 3 métricas, "Reporte", "Términos" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Estado A | Esperando participantes: pozo, faltan N, casillas, invitación en primer plano | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Estado B | Grupo completo / esperando inicio: fecha, protección, aviso de saldo | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Estado C | Ronda activa: pista de rondas, receptor, fecha, progreso, mensaje de recolección | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Estado D | Usuario sin saldo: tarjeta personal urgente primero + "Recargar y pagar" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Estado E | Ronda completa (pozo se deposita el …) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Estado F | Pandero terminado + archivar (solo quien lo creó) | ✓ | ✓ | ✓ | ✓ | ✅ | archivar no es una acción financiera |
| Común | "Tu participación" (aporte + turno), nota del creador (sin privilegios), orden de turnos con filtros y "Ver más", registro por ronda, términos | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modo demo | "Simular que alguien se une" · "Simular que pasó el mes" (inicia el juego) · "Simular que X recarga" · "Simular fin de mes" | ✓ | ✓ | ✓ | ✓ | ✅ | ver desviaciones |
| Foro | Panderos públicos ordenados por fase, "Ver términos y unirme", "Ver mi pandero", "Publicar un pandero" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Términos (solo lectura / aceptar para unirse) | ✓ | ✓ | ✓ | ✓ | ✅ | |

## 7. Billetera, Perfil, Notificaciones

| Pantalla | Elemento | HTML | React | Visual | Funciona | Estado | Notas |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| `/wallet` | Saldo, ≈ S/, copiar dirección, "Recargar", "Mi dirección" | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/wallet` | Wallets conectadas (Freighter/Cavos/Privy) conectar/desconectar; aviso de aportes sin cobrar; Moneda; En bóvedas; Movimientos | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Recargar (elegir wallet, monto, errores, conectar al continuar, procesando, éxito, reintento de débitos del pandero) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Conectar wallet (embebida con correo / extensión), Mi dirección | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/profile` | Cabecera + editar perfil (validación), código de usuario, seguridad, billetera, cerrar sesión | ✓ | ✓ | ✓ | ✓ | ✅ | |
| `/profile` | Estadísticas, Mis grupos (Pagar/Ver), Archivados (resumen), Actividad reciente | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Modal | Resumen de grupo archivado (ver registro / reporte) | ✓ | ✓ | ✓ | ✓ | ✅ | |
| Notificaciones | Contador, marcar todas, abrir con navegación contextual (grupo / archivado / billetera) | ✓ | ✓ | ✓ | ✓ | ✅ | diálogo (como el prototipo) + página `/notifications` |

## Desviaciones y elementos no aplicables (transparencia)

1. **`openMembers` / `openConnectPicker`**: existen en el JS del HTML pero **no tienen ningún botón que los invoque** en v10 (`#see-all` ya no existe; el selector de wallets no se usa). No se migraron para no dejar código inalcanzable. ➖
2. **Modo demo — acciones extra del brief** (§21: "completar cupos", "completar aportes", "completar pandero"): **no existen en el HTML**, así que no se añadieron (regla: el HTML manda). El mismo resultado se obtiene repitiendo las acciones existentes. ➖
3. **`/notifications`**: el HTML solo tiene el diálogo; la ruta del brief se implementó como página con el mismo componente (superset). ✅
4. **Modo `supabase`**: el panel "Modo demo" y la recarga simulada se ocultan (no aplican a datos reales) y la billetera muestra el saldo real de Testnet. Rondas del pandero, contador de recordatorios y devoluciones *on-chain* **no** están persistidos en este MVP (ver `docs/SUPABASE.md`, "Límites conocidos").
5. **Iconos**: se conservan los SVG del prototipo (paridad exacta). `lucide-react` está instalado pero sin uso por ahora.
