import { create } from 'zustand';
import type { CartItem } from '@/src/lib/types/cart';

interface EditModalState {
  editingCartItem: CartItem | null;
  openEdit: (item: CartItem) => void;
  closeEdit: () => void;
}

export const useEditModalStore = create<EditModalState>((set) => ({
  editingCartItem: null,
  openEdit: (item) => set({ editingCartItem: item }),
  closeEdit: () => set({ editingCartItem: null }),
}));
