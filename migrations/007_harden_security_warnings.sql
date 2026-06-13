-- ============================================================
-- Migration 007: Resolve Supabase security-linter warnings
-- ============================================================
-- Addresses the WARN-level findings from the Supabase database
-- linter (Documentos/warnings). All low severity, all hardening.
--
-- Covers 10 of the 11 warnings. The remaining one —
-- "Leaked Password Protection Disabled" — is an Auth config
-- toggle, NOT SQL. Enable it in:
--   Dashboard → Authentication → Sign In / Providers → Password
--   → "Leaked password protection" (HaveIBeenPwned).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1) function_search_path_mutable  (warnings 1–5)
-- ------------------------------------------------------------
-- Pin search_path so unqualified name resolution can't be
-- hijacked. We keep `public` available (these functions
-- reference public tables unqualified) and append pg_temp.
-- ALTER ... SET only changes the GUC, never the function body.
ALTER FUNCTION public.seed_user_defaults()            SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()      SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()               SET search_path = public, pg_temp;
ALTER FUNCTION public.create_next_recurring_expense() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_modified_column()        SET search_path = public, pg_temp;

-- ------------------------------------------------------------
-- 2) SECURITY DEFINER functions exposed as RPC  (warnings 7–10)
-- ------------------------------------------------------------
-- handle_new_user / seed_user_defaults are TRIGGER functions.
-- Triggers fire under the table-owner context regardless of
-- EXECUTE grants, so revoking EXECUTE does NOT break the
-- trigger — it only removes the direct /rest/v1/rpc/... path
-- that anon and authenticated should never have had.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.seed_user_defaults() FROM anon, authenticated, public;

-- ------------------------------------------------------------
-- 3) public_bucket_allows_listing — avatars  (warning 6)
-- ------------------------------------------------------------
-- The broad SELECT policy lets any client LIST every file in
-- the public `avatars` bucket. Public buckets serve objects by
-- URL without a SELECT policy, so dropping it is the documented
-- fix. NOTE: if any client code calls supabase.storage
-- .from('avatars').list(), that listing will stop working —
-- avatar <img src> by public URL keeps working fine.
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- (a) No public-schema function should still have a mutable search_path:
SELECT n.nspname AS schema, p.proname AS function, p.proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
   AND p.proname IN ('seed_user_defaults','update_updated_at_column',
                     'handle_new_user','create_next_recurring_expense',
                     'update_modified_column');
-- Expected: every row's proconfig contains 'search_path=public, pg_temp'.

-- (b) anon/authenticated should no longer hold EXECUTE on the two definers:
SELECT routine_name, grantee, privilege_type
  FROM information_schema.routine_privileges
 WHERE specific_schema = 'public'
   AND routine_name IN ('handle_new_user','seed_user_defaults')
   AND grantee IN ('anon','authenticated','public');
-- Expected: 0 rows.

-- (c) The broad avatars listing policy should be gone:
SELECT policyname FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname = 'Anyone can view avatars';
-- Expected: 0 rows.
