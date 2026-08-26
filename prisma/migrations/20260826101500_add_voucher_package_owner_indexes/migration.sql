CREATE INDEX "idx_vouchers_package_status" ON "vouchers"("package_id", "status");

CREATE INDEX "idx_vouchers_package_user" ON "vouchers"("package_id", "user_id");
