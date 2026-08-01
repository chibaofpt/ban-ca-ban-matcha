import type { Address } from "@/src/lib/types/address";

export interface AddressBookState {
  view: "list" | "form";
  editingAddress: Address | null;
}

/** Create the initial address-book list state. */
export function createAddressBookState(): AddressBookState {
  return { view: "list", editingAddress: null };
}

/** Move the address book to a blank create form. */
export function openNewAddressForm(
  state: AddressBookState,
): AddressBookState {
  void state;
  return { view: "form", editingAddress: null };
}

/** Move the address book to the edit form for a selected address. */
export function openAddressEditor(
  _state: AddressBookState,
  address: Address,
): AddressBookState {
  return { view: "form", editingAddress: address };
}

/** Return from the form layer to the address list. */
export function returnToAddressList(
  state: AddressBookState,
): AddressBookState {
  void state;
  return createAddressBookState();
}
