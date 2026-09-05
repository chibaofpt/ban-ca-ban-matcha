import { describe, expect, it } from "vitest";

import { buildAddonGroupSubmission } from "@/src/components/admin/addonGroupFormModel";
import type {
  AddonGroupFormFields,
} from "@/src/components/admin/addonGroupFormModel";

describe("addonGroupFormModel", () => {
  it("chuẩn hóa nhóm gram động theo contract trước khi gửi API", () => {
    const values: AddonGroupFormFields = {
      name: "  Extra Matcha  ",
      description: "  Chọn lượng bột thêm  ",
      max_select: "3",
      is_dynamic_gram: true,
      is_active: true,
      options: [
        {
          image_key: "option-1",
          image_url: null,
          image_file: null,
          image_filename: "extra-2g",
          label: "  +2g  ",
          price_vnd: "12000",
          is_active: true,
          sort_order: "",
          gram_value: "2",
        },
      ],
    };

    expect(buildAddonGroupSubmission(values)).toEqual({
      payload: {
        name: "Extra Matcha",
        description: "Chọn lượng bột thêm",
        max_select: 1,
        is_dynamic_gram: true,
        is_active: true,
        options: [
          {
            id: undefined,
            image_key: "option-1",
            label: "+2g",
            price_vnd: 0,
            is_active: true,
            sort_order: 0,
            gram_value: 2,
          },
        ],
      },
      optionImages: [
        {
          imageKey: "option-1",
          imageFile: null,
          imageFilename: "extra-2g",
        },
      ],
    });
  });

  it("loại bỏ gram khỏi nhóm giá cố định nhưng giữ giá và giới hạn chọn", () => {
    const submission = buildAddonGroupSubmission({
      name: "Topping",
      description: "",
      max_select: "2",
      is_dynamic_gram: false,
      is_active: true,
      options: [
        {
          image_key: "option-fixed",
          image_url: null,
          image_file: null,
          image_filename: "",
          label: "Kem sữa",
          price_vnd: "12000",
          is_active: true,
          sort_order: "4",
          gram_value: "2",
        },
      ],
    });

    expect(submission.payload).toMatchObject({
      max_select: 2,
      is_dynamic_gram: false,
      options: [{ price_vnd: 12000, gram_value: null, sort_order: 4 }],
    });
  });
});
