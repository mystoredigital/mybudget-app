-- ============================================================
-- Migration 003: Consolidate all data to a single user
-- ============================================================
-- Reassigns every row currently owned by another auth user to
-- iam@yoanyandres.one, then enables `security_invoker` on
-- expenses_view so RLS is honored.
--
-- This is idempotent: re-running is a no-op once consolidated.
--
-- HOW TO RUN
-- ----------
-- 1. Open Supabase Dashboard → SQL Editor → paste this whole file → Run.
-- 2. Verify the final SELECT shows 0 in every "not_target" cell.
-- 3. Go to Authentication → Users and delete every user EXCEPT
--    iam@yoanyandres.one. Their auth rows are no longer referenced
--    from app data, so the cascade only removes their `profiles` row.
-- 4. (Optional, only if you need old comprobantes accessible)
--    The Storage bucket `comprobantes` paths start with the OLD
--    user_id, so RLS will block access after consolidation. Either
--    re-upload them or rename the top-level folder in the Storage UI
--    to the target user_id.
-- ============================================================

DO $$
DECLARE
  v_target uuid;
BEGIN
  SELECT id INTO v_target
    FROM auth.users
   WHERE lower(email) = 'iam@yoanyandres.one';

  IF v_target IS NULL THEN
    RAISE EXCEPTION
      'Target user iam@yoanyandres.one not found in auth.users — create that user first';
  END IF;

  RAISE NOTICE 'Consolidating all data to user_id %', v_target;

  -- user_categories — UNIQUE(user_id, name)
  DELETE FROM public.user_categories
   WHERE user_id <> v_target
     AND name IN (SELECT name FROM public.user_categories WHERE user_id = v_target);
  UPDATE public.user_categories SET user_id = v_target WHERE user_id <> v_target;

  -- user_portfolios — UNIQUE(user_id, name)
  DELETE FROM public.user_portfolios
   WHERE user_id <> v_target
     AND name IN (SELECT name FROM public.user_portfolios WHERE user_id = v_target);
  UPDATE public.user_portfolios SET user_id = v_target WHERE user_id <> v_target;

  -- Remaining tables: no UNIQUE on user_id, just reassign
  UPDATE public.expenses                 SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.expense_files            SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.portfolio_partners       SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.portfolio_operators      SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.portfolio_periods        SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.portfolio_movements      SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.portfolio_period_incomes SET user_id = v_target WHERE user_id <> v_target;
  UPDATE public.portfolio_movement_files SET user_id = v_target WHERE user_id <> v_target;
END $$;

-- Fix the view that was bypassing RLS (root cause of the
-- "Cannot coerce the result to a single JSON object" error).
ALTER VIEW public.expenses_view SET (security_invoker = true);

-- Sanity check — every row should be 0
WITH target AS (
  SELECT id FROM auth.users WHERE lower(email) = 'iam@yoanyandres.one'
)
SELECT 'expenses'                  AS tbl, count(*) AS not_target FROM public.expenses                 WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'expense_files',                 count(*)         FROM public.expense_files            WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'user_categories',               count(*)         FROM public.user_categories          WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'user_portfolios',               count(*)         FROM public.user_portfolios          WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'portfolio_partners',            count(*)         FROM public.portfolio_partners       WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'portfolio_operators',           count(*)         FROM public.portfolio_operators      WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'portfolio_periods',             count(*)         FROM public.portfolio_periods        WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'portfolio_movements',           count(*)         FROM public.portfolio_movements      WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'portfolio_period_incomes',      count(*)         FROM public.portfolio_period_incomes WHERE user_id <> (SELECT id FROM target)
UNION ALL SELECT 'portfolio_movement_files',      count(*)         FROM public.portfolio_movement_files WHERE user_id <> (SELECT id FROM target);
