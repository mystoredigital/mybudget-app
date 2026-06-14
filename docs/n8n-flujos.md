# Flujos n8n — MyBudget v2

La app expone los datos en Supabase; n8n corre los crones y notificaciones.
Usar el **service_role key** en el nodo Supabase/HTTP (server-side, nunca en el front).

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
