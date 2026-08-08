-- Wave 1: harden the public Data API surface without changing Prisma models.
--
-- This migration intentionally enables (but does not FORCE) RLS. The custom-auth
-- app has no Supabase Auth identity, so it intentionally creates no user-scoped
-- policies. The direct Prisma owner keeps operating normally; PostgREST access is
-- reduced to the Edge refresh-session operations documented below.
--
-- Staging preflight (capture before applying):
--   SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
--   ORDER BY c.relkind, c.relname;
--   SELECT defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl
--   FROM pg_default_acl ORDER BY 1, 2, 3;
--
-- Compensating rollback guidance:
--   1. Restore object/default ACLs from the preflight snapshot in a new migration.
--   2. DISABLE ROW LEVEL SECURITY on the same 26 tables listed below only if the
--      prior ACLs have been restored and accepting the former Data API exposure is
--      an explicit incident decision.
--   3. The minimum app-continuity rollback is safer: keep RLS enabled and restore
--      only a missing service_role grant proven by a PostgREST 42501 response.
-- Never edit or delete this applied migration; compensate forward.

BEGIN;

-- Prisma-managed application tables in public (schema.prisma audit: 2026-08-04).
ALTER TABLE IF EXISTS public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."otp_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."voucher_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."points_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."addon_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."addon_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."menu_item_sizes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."order_item_addons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."order_discount_vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."order_item_addon_vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."matcha_powder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."milk_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."default_size_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."powder_size_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."fusion_allowed_powder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."store_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."store_temporary_closure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."system_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."push_subscriptions" ENABLE ROW LEVEL SECURITY;

-- Remove inherited/default Data API reachability from every existing public
-- relation. This also protects Prisma's migration metadata table if present.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

-- Stop Supabase's historical automatic Data API grants on future public objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

-- PostgreSQL's PUBLIC function EXECUTE default is global, so a schema-scoped
-- revoke cannot remove it. This targets only functions later owned by postgres;
-- it does not modify existing storage objects or storage-owned defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Edge middleware PostgREST allowlist:
--   sessions: GET, POST with return=representation, PATCH, and DELETE.
--   users: embedded GET reads only id, role, and phone_number.
-- UUID defaults require no application sequence privileges.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO service_role;
GRANT SELECT (id, role, phone_number) ON TABLE public.users TO service_role;

COMMIT;
