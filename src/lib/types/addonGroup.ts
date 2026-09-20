export type {
  AddonGroupDetailsMutationPayload,
  AddonGroupMutationPayload,
  AddonGroupReorderEntry,
  AddonOptionCreatePayload,
  AddonOptionDetailsMutationPayload,
  AdminAddonGroup,
  AdminAddonOption,
} from "@/contracts/admin/catalog";

/** Cropped image data correlated to one option in an addon-group mutation. */
export interface AddonOptionImageUpload {
  imageKey: string;
  imageFile: File | null;
  imageFilename: string;
}
