# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/)
y [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased] — v2 (en desarrollo)

Rediseño hacia **panel de control financiero** en 3 capas (ver
[docs/v2-arquitectura.md](docs/v2-arquitectura.md)):

- **Planeado**: presupuesto + nuevo módulo Servicios/Dominios con alertas n8n.
- **Real**: cuentas/wallets con saldo en vivo, movimientos (ingreso/gasto/traslado),
  los traslados no afectan el neto.
- **Lente Socio**: portafolio rehecho (comisión − gastos compartidos → reparto).
- Tipo de cambio USD/COP como capa transversal (indicador + tasa por transacción).
- Contactos sincronizados con Nextcloud (CardDAV vía n8n).

Trabajo en la rama `v2`; se mergea a `main` por fases.

---

## [1.0.0] — 2026-06-13

Primera versión funcional. App personal de control de presupuesto e inversiones.

### Funcionalidades
- **Autenticación** con Supabase (single-user: `iam@yoanyandres.one`).
- **Presupuesto** (`expenses`): categorías dinámicas, estados Pendiente/Pagado/Vencido,
  fecha de vencimiento con cálculo `vence_en` (timezone America/Bogota), valor en COP/USD,
  frecuencia recurrente (auto-duplicación al pagar), comprobantes adjuntos.
- **Dashboard** mensual: pendiente/pagado/total/progreso/vencidos + tablas.
- **Vistas de gastos**: por estado, categoría, mes, calendario y "Food".
- **Portafolios**: tipo `simple` (etiqueta) y `shared` (socios, operadores, periodos
  mensuales, movimientos y reparto de ingresos).
- **Ajustes**: tema claro/oscuro, backup CSV, webhooks n8n (recordatorios + sync).
- **Storage**: comprobantes (privado) y avatars (público).
- **Mobile**: empaquetado con Capacitor; deploy con Docker + nginx.

### Mantenimiento incluido en este corte
- Consolidación a un solo usuario y `security_invoker` en `expenses_view`.
- Fix de triggers de recurrentes y timezone de la vista.
- Hardening de webhooks (timeout + logging) y de warnings del linter de Supabase.

### Limitaciones conocidas (que V2 resuelve)
- Portafolio `shared` resultó complejo de operar.
- No hay control de tesorería real (cuentas con saldo, traslados vs gastos).
- No hay tipo de cambio USD/COP.
- No hay módulo de servicios/dominios contratados ni alertas de vencimiento.
- Sin integración de contactos.
