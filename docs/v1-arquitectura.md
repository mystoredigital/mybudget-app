# MyBudget v1 — Arquitectura (congelada en tag `v1.0.0`)

Documento de referencia de la versión 1. V2 evoluciona sobre esta base
(ver [v2-arquitectura.md](v2-arquitectura.md)).

## Stack
- **Frontend**: React + TypeScript + Vite, React Router, Tailwind CSS,
  lucide-react, date-fns.
- **Backend**: Supabase (Auth + PostgreSQL + Storage).
- **Mobile**: Capacitor.
- **Deploy**: Docker + nginx.
- **Automatización**: n8n vía webhooks configurables.

## Rutas / pantallas
- `/` Dashboard (resumen mensual)
- `/expenses` tabla; `/expenses/estado|categoria|mes|food|calendar` vistas
- `/portfolios` y `/portfolios/:id` (tabs: Dashboard, Movimientos, Socios, Operadores, Periodos)
- `/settings` (tema, backup CSV, webhooks)
- `/login`

## Modelo de datos (esquema `public`)
| Tabla | Rol |
|-------|-----|
| `profiles` | perfil 1:1 con `auth.users` |
| `expenses` | núcleo del presupuesto (gastos/pagos) |
| `expense_files` | comprobantes de un gasto |
| `expenses_view` | vista con `vence_en` calculado |
| `user_categories` | categorías dinámicas por usuario |
| `user_portfolios` | portafolios `simple` / `shared` |
| `user_settings` | tema + webhooks (reminders/sync) |
| `portfolio_partners` | socios de un portafolio shared |
| `portfolio_operators` | operadores (terceros pagados) |
| `portfolio_periods` | cierre mensual de un portafolio shared |
| `portfolio_period_incomes` | desglose de ingresos del periodo |
| `portfolio_movements` | movimientos del portafolio (gasto/pago/ajuste) |
| `portfolio_movement_files` | adjuntos de movimientos |

Storage: `comprobantes` (privado, RLS por carpeta = user_id), `avatars` (público).

## Automatizaciones n8n
- `webhook_reminders`: pagos que vencen en 3 días (cron diario).
- `webhook_sync`: empuja cada movimiento/pago a sistemas externos (ERP/Drive).

## Lógica relevante
- Duplicación de gastos recurrentes: hecha en el **frontend**
  (`PaymentConfirmModal.handleConfirm`), no en trigger de DB.
- `expenses_view` usa `security_invoker = true` y timezone America/Bogota.

## Migraciones
`migrations/001`…`007`. La `004` está marcada `.DEPRECATED` (el trigger de
recurrentes no se usa; lo hace el frontend).
