-- ============================================================
-- Migration 005: Drop legacy recurring-expense trigger
-- ============================================================
-- Found a second AFTER UPDATE trigger on `expenses` that called
-- `handle_recurring_expense()` — a pre-rename version of the
-- recurring handler that still referenced the old column name
-- `tipo_presupuesto`. It duplicated the work of
-- `create_next_recurring_expense` (fixed in migration 004) and
-- was breaking every Pendiente→Pagado update.
--
-- Idempotent.
-- ============================================================

DROP TRIGGER IF EXISTS on_expense_paid ON public.expenses;
DROP FUNCTION IF EXISTS public.handle_recurring_expense();

-- Sanity: only the canonical trigger should remain
SELECT trigger_name, action_timing, event_manipulation, action_statement
  FROM information_schema.triggers
 WHERE event_object_schema = 'public'
   AND event_object_table  = 'expenses'
 ORDER BY trigger_name;
-- Expected: trigger_create_next_recurring_expense (+ update_expenses_updated_at).
