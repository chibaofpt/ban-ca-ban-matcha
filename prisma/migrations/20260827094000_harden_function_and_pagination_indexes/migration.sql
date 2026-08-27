-- Pin name resolution for the shared updated_at trigger function.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

-- Match bounded cursor reads introduced by the security pagination pass.
CREATE INDEX IF NOT EXISTS idx_points_log_user_created_cursor
  ON public.points_log (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_vouchers_user_created_cursor
  ON public.vouchers (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active_cursor
  ON public.push_subscriptions (id)
  WHERE is_active = true;
