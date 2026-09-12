-- Concurrent index step: this file must run without transaction wrapping.
CREATE INDEX CONCURRENTLY "vouchers_issuing_admin_id_idx"
  ON "vouchers"("issuing_admin_id");
