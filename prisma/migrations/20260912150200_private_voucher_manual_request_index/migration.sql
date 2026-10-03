-- Concurrent index step: this file must run without transaction wrapping.
CREATE UNIQUE INDEX CONCURRENTLY "vouchers_manual_request_id_key"
  ON "vouchers"("manual_request_id");
