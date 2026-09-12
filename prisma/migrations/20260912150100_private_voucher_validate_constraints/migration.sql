-- Validation step: release base DDL locks before scanning historical rows.
ALTER TABLE "voucher_packages"
  VALIDATE CONSTRAINT "voucher_packages_visibility_acquisition_mode_check";

ALTER TABLE "vouchers"
  VALIDATE CONSTRAINT "vouchers_issued_via_not_none_check";

ALTER TABLE "vouchers"
  VALIDATE CONSTRAINT "vouchers_admin_audit_fields_check";

ALTER TABLE "vouchers"
  VALIDATE CONSTRAINT "vouchers_issuing_admin_id_fkey";
