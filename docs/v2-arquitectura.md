# MyBudget v2 — Arquitectura (en desarrollo, rama `v2`)

Evolución de [v1](v1-arquitectura.md) hacia un **panel de control financiero**.
Decisiones acordadas el 2026-06-13.

## Idea central: 3 capas

| Capa | Pregunta | Contenido |
|------|----------|-----------|
| **1. Planeado** | ¿Qué debo pagar y cuándo? | Presupuesto (`expenses`) + Servicios/Dominios. Items con vencimiento, estado y alertas n8n. |
| **2. Real** | ¿Qué tengo de verdad? | `cuentas` con saldo en vivo + `movimientos` (ingreso/gasto/traslado). Traslados entre cuentas propias NO afectan el neto; solo gastos lo reducen. |
| **3. Lente Socio** | ¿Cuánto le toca al socio? | Portafolio mensual: comisión − gastos compartidos → reparto. |

**Puente:** al pagar un item de capa 1 se elige la cuenta → se crea un
movimiento de gasto (capa 2) y el saldo baja solo.

## Modelo de operación del usuario
Llega comisión total (USDT/USD) → registra ingresos y gastos del mes → se divide
por socio. Su parte fluye Banco → Wallet USDT → ARQ/Bancolombia. Mover entre sus
cuentas = **traslado** (no gasto). El gasto real ocurre en banco destino o tarjeta
de wallet (Binance/Bybit) y ahí baja lo que tiene. Gastos fijos → presupuesto;
gastos de wallet → variables.

## Tablas nuevas (propuestas)
- **`cuentas`**: `nombre, tipo (banco/wallet/tarjeta/efectivo), moneda, saldo_inicial`.
- **`movimientos`**: `tipo, concepto, monto, moneda, fecha, cuenta_origen, cuenta_destino,
  tasa_usada, monto_destino, categoria, status, expense_id?, servicio_id?, portafolio_id?,
  periodo_id?, es_compartido, socio_id?`.
- **`servicios`**: `nombre, categoria, proveedor, cliente_id, costo, moneda, ciclo,
  fecha_renovacion, auto_renueva, url_panel, notas, dias_alerta[]`.
- **`contactos`**: espejo CardDAV de Nextcloud (`nombre, email, whatsapp, cumpleaños, carddav_uid`).
- **`tasas_cambio`**: `fecha, valor, fuente (api/manual)` — USD/COP diario (cron n8n; TRM datos.gov.co).

## Cambios sobre v1
- `expenses` += `cuenta_id` (pago vinculado a cuenta).
- `portfolio_movements` y `portfolio_operators` → **DEPRECADAS** (los operadores no
  existen en la operación real; los gastos del periodo pasan al ledger `movimientos`).
- Portafolio reusa `portfolio_periods` / `portfolio_partners` / `portfolio_period_incomes`.

## Tipo de cambio (capa transversal)
Indicador del dólar en el panel. Cada transacción con cambio guarda la tasa de su día
(default = API, **editable manual** porque importa "lo que te pagan", no el mercado).

## Decisiones
- Servicios = control de costo; cliente = atribución. Al vencer → gasto Pendiente +
  alerta n8n (30/15/7 días; pagos normales a 3 días).
- Reparto socio: gastos compartidos antes de dividir, **% variable**, **un socio fijo**.
  "Descuentos al socio" = pagos + gastos del mes (ambos reducen lo que se le entrega).
- Contactos: sync en vivo Nextcloud (CardDAV vía n8n) → cliente de servicios + cumpleaños.
- Cumpleaños + tareas Affine = NO prioridad (fase 4-5).

## Roadmap por fases
1. Cuentas + Movimientos + Traslados + FX + vincular pago de presupuesto.
2. Servicios/Dominios + alertas n8n.
3. Portafolio rehecho sobre el ledger.
4. Contactos Nextcloud + cumpleaños.
5. Panel que une todo (+ opcional Affine).
