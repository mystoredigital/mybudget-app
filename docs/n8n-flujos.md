# Flujos n8n — MyBudget v2

La app expone los datos en Supabase; n8n corre los crones y notificaciones.
Usar el **service_role key** en el nodo Supabase/HTTP (server-side, nunca en el front).

> **Estado (2026-06-14): IMPLEMENTADO y activo** en `n8n.mystoredigital.cloud`.
> - `MyBudget - Tasa de cambio diaria (USD/COP)` → id `tDL6fiznqRcYKM4Y` (cron 06:00).
> - `MyBudget - Alerta de Servicios/Dominios (30/15/7)` → id `FGFLcLqj3fdYsYq2` (cron 08:00).
> Reusan el bot de Telegram del flujo de pagos (cred `SNuF3zPIkSDlK9RO`, chat `523281213`).
> Script reproducible: `scripts/n8n_create_flows.py` (idempotente, upsert por nombre).
> Nota: la fuente del dólar se cambió de la TRM de datos.gov.co a **open.er-api.com**
> (gratis, sin key, más estable). El valor es referencia; el usuario puede sobrescribir manual.

## 1. Tasa de cambio diaria (USD/COP)
**Cron:** diario, ~6:00 COT.
1. HTTP GET a la TRM oficial (gratis, sin key):
   `https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC`
   → campo `valor`.
2. Upsert en `tasas_cambio`:
   ```json
   { "user_id": "<uid>", "fecha": "<hoy>", "par": "USD_COP", "valor": <valor>, "fuente": "api" }
   ```
   onConflict: `user_id,fecha,par`. La app lee la última fila como indicador
   (el usuario puede sobrescribir manual).

## 2. Recordatorio de pagos del presupuesto (3 días)
**Cron:** diario. Webhook configurable en Ajustes → `webhook_reminders`.
- Query `expenses_view`: `status = 'Pendiente'` y `fecha` entre hoy y hoy+3.
- Enviar notificación (WhatsApp/Telegram/email) por cada uno.

## 3. Alertas de servicios / dominios (30/15/7 días)
**Cron:** diario.
- Query `servicios_view`: `activo = true` y `dias_para_renovar = ANY(dias_alerta)`.
  ```sql
  select * from servicios_view
   where activo and dias_para_renovar = any(dias_alerta);
  ```
- Notificar: "«{nombre}» ({cliente}) renueva en {dias_para_renovar} días — {costo} {moneda}".

## 4. (Opcional) Auto-generar el pago al vencer
Cuando `dias_para_renovar <= 0` y `auto_renueva = true`, n8n puede crear el gasto
Pendiente e avanzar la fecha (misma lógica que el botón "Generar pago" de la app):
- INSERT en `expenses` con `servicio_id`, `expense=nombre`, `categoria='Servicios'`,
  `status='Pendiente'`, `fecha=fecha_renovacion`, `valor=costo`, `moneda`, `link=url_panel`.
- UPDATE `servicios.fecha_renovacion` al siguiente ciclo.
- Evitar duplicar: verificar que no exista ya un expense Pendiente con ese `servicio_id` + `fecha`.

> Hoy el usuario puede generar el pago manualmente desde la pantalla Servicios;
> este flujo solo lo automatiza.

## 5. Registrar movimiento por Telegram (bot principal)
Bot `SNuF3zPIkSDlK9RO` (chat `523281213`). Telegram → Code (foto→visión OpenRouter
o texto) → inserta en `movimientos` y responde con el nuevo saldo.
Script: `scripts/n8n_telegram_movimiento.py` (workflow `ZHNinNenvTV3RWwv`).

## 6. Reporte diario de saldos por Telegram (bot dedicado)
**Bot nuevo `@reportdiariobot`** (credencial `PubvccixpMzjA2DR`), workflow
`MyBudget - Reporte diario por Telegram` → id `J3EOCDHg76fOz2zZ` (activo).
Script: `scripts/n8n_telegram_reporte.py` (token en `.env` → `TG_REPORTE_BOT_TOKEN`).

Flujo: Telegram Trigger → Code → Responder.
1. Lee el texto del mensaje (el reporte que manda el asistente).
2. Trae `reporte_conceptos` (activos) del usuario y, por cada concepto, busca en el
   texto la línea con su palabra distintiva (lirio, forus, credil, rds, doradobet,
   bybit, pendientes…) y extrae el monto. Parser tolera formato `95.653,08` y `14.600$`.
3. Upsert de `reportes_diarios` (único por `user_id,fecha`, fecha America/Bogota) y
   reemplaza los `reporte_items` del día (cada uno con su signo).
4. Responde con el desglose y el **TOTAL** = Σ(signo × monto). Avisa los conceptos
   sin dato (quedan en 0).

> Es un bot SEPARADO del de movimientos (un bot Telegram = un webhook). Para que el
> bot reconozca conceptos, primero hay que abrir la app → Reporte diario una vez
> (siembra los 8 conceptos por defecto), o crearlos ahí.
