import { describe, expect, it } from "vitest";
import {
  reorderAddonGroupsSchema,
  updateAddonGroupDetailsSchema,
  updateAddonOptionDetailsSchema,
} from "@/lib/validations/addonGroup";

describe("Admin add-on mutation contracts", () => {
  it("does not allow a details update to change pricing type", () => {
    const result = updateAddonGroupDetailsSchema.safeParse({
      name: "Kem",
      description: null,
      max_select: 1,
      is_dynamic_gram: true,
    });

    expect(result.success).toBe(false);
  });

  it("keeps activation and ordering out of option details", () => {
    const result = updateAddonOptionDetailsSchema.safeParse({
      label: "Kem sua",
      price_vnd: 10_000,
      gram_value: null,
      is_active: false,
      sort_order: 3,
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate group and option ids in a reorder payload", () => {
    const groupId = "11111111-1111-4111-8111-111111111111";
    const optionId = "22222222-2222-4222-8222-222222222222";
    const result = reorderAddonGroupsSchema.safeParse({
      groups: [
        { id: groupId, option_ids: [optionId] },
        { id: groupId, option_ids: [optionId] },
      ],
    });

    expect(result.success).toBe(false);
  });
});
