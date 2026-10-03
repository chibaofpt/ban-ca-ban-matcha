-- Concurrent index step: this file must run without transaction wrapping.
CREATE INDEX CONCURRENTLY "idx_vouchers_package_issued_via"
  ON "vouchers"("package_id", "issued_via");
