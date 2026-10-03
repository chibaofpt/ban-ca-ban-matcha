-- Middleware joins users through PostgREST to reject blocked live sessions.
-- Keep the Data API allowlist column-scoped while exposing that required status.
GRANT SELECT (is_blocked) ON TABLE public.users TO service_role;
