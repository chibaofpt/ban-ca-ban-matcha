-- Base step: add private package visibility, shared enum labels, and audited issuance fields.
-- All constraints start NOT VALID so their historical-row scans happen in the validation step.
CREATE TYPE "VoucherPackageVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "voucher_packages"
  ADD COLUMN "visibility" "VoucherPackageVisibility" NOT NULL DEFAULT 'PUBLIC';

ALTER TYPE "VoucherAcquisitionMode" ADD VALUE 'NONE';
ALTER TYPE "VoucherAcquisitionMode" ADD VALUE 'ADMIN';

ALTER TABLE "voucher_packages"
  ADD CONSTRAINT "voucher_packages_visibility_acquisition_mode_check"
  CHECK (
    ("visibility"::text = 'PRIVATE' AND "acquisition_mode"::text = 'NONE')
    OR ("visibility"::text = 'PUBLIC' AND "acquisition_mode"::text IN ('POINTS_EXCHANGE', 'FREE_CLAIM', 'AUTO_GRANT'))
  ) NOT VALID;

ALTER TABLE "vouchers"
  ADD COLUMN "issuing_admin_id" UUID,
  ADD COLUMN "manual_request_id" UUID;

ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_issued_via_not_none_check"
  CHECK ("issued_via"::text <> 'NONE') NOT VALID;

ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_admin_audit_fields_check"
  CHECK (
    ("issued_via"::text = 'ADMIN'
      AND "issuing_admin_id" IS NOT NULL
      AND "manual_request_id" IS NOT NULL)
    OR ("issued_via"::text <> 'ADMIN'
      AND "issuing_admin_id" IS NULL
      AND "manual_request_id" IS NULL)
  ) NOT VALID;

ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_issuing_admin_id_fkey"
  FOREIGN KEY ("issuing_admin_id") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION
  NOT VALID;
