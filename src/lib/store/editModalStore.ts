import { create } from 'zustand';
import type { CartItem } from '@/src/lib/types/cart';
import type { Size } from '@/src/lib/types/menu';

interface EditModalState {
  editingCartItem: CartItem | null;
  /** Exact size scope imposed while configuring a BUNDLE allocation. */
  editingAllowedSizes: Size[] | undefined;
  openEdit: (item: CartItem, allowedSizes?: Size[]) => void;
  closeEdit: () => void;
}

export const useEditModalStore = create<EditModalState>((set) => ({
  editingCartItem: null,
  editingAllowedSizes: undefined,
  openEdit: (item, allowedSizes) => set({ editingCartItem: item, editingAllowedSizes: allowedSizes }),
  closeEdit: () => set({ editingCartItem: null, editingAllowedSizes: undefined }),
}));
