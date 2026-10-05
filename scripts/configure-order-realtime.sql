-- Supabase platform configuration only; application tables remain Prisma-owned.
-- Receives minimal signals. No application-table grants or client INSERT policy.
BEGIN;
DROP POLICY IF EXISTS orders_operations_receive ON realtime.messages;
CREATE POLICY orders_operations_receive
ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND topic = 'orders:operations'
  AND (SELECT realtime.topic()) = 'orders:operations'
  AND (SELECT auth.jwt() ->> 'purpose') = 'order-realtime'
  AND (SELECT auth.jwt() ->> 'app_role') IN ('ADMIN', 'STAFF')
);
COMMIT;
