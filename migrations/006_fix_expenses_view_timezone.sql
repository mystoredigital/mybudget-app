-- ============================================================
-- Migration 006: Fix expenses_view timezone
-- ============================================================
-- The view used `current_date`, which evaluates in the server's
-- timezone (Supabase = UTC). For a Colombia-based user that meant
-- "Vence hoy" appeared on rows whose due date was actually
-- tomorrow in local time, every evening after ~7pm COT.
--
-- Replace `current_date` with the date in `America/Bogota`.
--
-- Single-user app today; if/when multi-tenant ships, swap the
-- hardcoded timezone for a per-user preference.
--
-- Idempotent.
-- ============================================================

DROP VIEW IF EXISTS public.expenses_view;

CREATE VIEW public.expenses_view
WITH (security_invoker = true) AS
SELECT
  e.*,
  CASE
    WHEN e.status = 'Pagado' THEN 'Pagado'
    WHEN e.fecha IS NULL    THEN 'Sin fecha'
    WHEN e.status = 'Pendiente' THEN
      CASE
        WHEN (e.fecha - (now() AT TIME ZONE 'America/Bogota')::date) < 0
          THEN 'Vencido hace '
            || abs(e.fecha - (now() AT TIME ZONE 'America/Bogota')::date)
            || ' días'
        WHEN (e.fecha - (now() AT TIME ZONE 'America/Bogota')::date) = 0
          THEN 'Vence hoy'
        ELSE 'Vence en '
          || (e.fecha - (now() AT TIME ZONE 'America/Bogota')::date)
          || ' días'
      END
  END AS vence_en
FROM public.expenses e;
