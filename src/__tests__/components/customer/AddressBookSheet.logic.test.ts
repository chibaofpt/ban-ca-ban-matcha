import { describe, expect, it } from "vitest";
import {
  createAddressBookState,
  openAddressEditor,
  openNewAddressForm,
  returnToAddressList,
} from "@/src/lib/utils/addressBookSheet";
import type { Address } from "@/src/lib/types/address";
import { addressFormSchema } from "@/src/lib/validations/address";

const address: Address = {
  id: "address-1",
  user_id: "user-1",
  lat: 10.7,
  lng: 106.7,
  label: "Nhà",
  full_address: "123 Nguyễn Huệ",
  receiver_name: "Khách hàng",
  receiver_phone: "+84901234567",
  is_default: true,
  distance_km: 2,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("AddressBookSheet — chuyển tầng bottom sheet", () => {
  it("mở ở danh sách rồi chuyển sang form thêm mới", () => {
    const state = openNewAddressForm(createAddressBookState());

    expect(state).toEqual({ view: "form", editingAddress: null });
  });

  it("mở form sửa với đúng địa chỉ được chọn", () => {
    const state = openAddressEditor(createAddressBookState(), address);

    expect(state.view).toBe("form");
    expect(state.editingAddress?.id).toBe("address-1");
  });

  it("nút back từ form luôn quay về danh sách và xoá địa chỉ đang sửa", () => {
    const editingState = openAddressEditor(createAddressBookState(), address);

    expect(returnToAddressList(editingState)).toEqual({
      view: "list",
      editingAddress: null,
    });
  });
});

describe("AddressForm — validation", () => {
  it("chấp nhận địa chỉ đầy đủ và số điện thoại Việt Nam", () => {
    const result = addressFormSchema.safeParse({
      full_address: "123 Nguyễn Huệ, Quận 1",
      label: "Nhà",
      lat: 10.7,
      lng: 106.7,
      receiver_name: "Khách hàng",
      receiver_phone: "0901234567",
      is_default: false,
    });

    expect(result.success).toBe(true);
  });

  it("từ chối khi chưa chọn vị trí và báo lỗi đúng field", () => {
    const result = addressFormSchema.safeParse({
      full_address: "",
      label: "Nhà",
      lat: null,
      lng: null,
      receiver_name: "Khách hàng",
      receiver_phone: "0901234567",
      is_default: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.full_address).toBeDefined();
      expect(result.error.flatten().fieldErrors.lat).toBeDefined();
    }
  });

  it("từ chối số điện thoại sai định dạng", () => {
    const result = addressFormSchema.safeParse({
      full_address: "123 Nguyễn Huệ, Quận 1",
      label: "Nhà",
      lat: 10.7,
      lng: 106.7,
      receiver_name: "Khách hàng",
      receiver_phone: "12345",
      is_default: false,
    });

    expect(result.success).toBe(false);
  });
});
