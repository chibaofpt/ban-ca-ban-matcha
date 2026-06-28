/** Admin view of a milk type */
export interface AdminMilkType {
  id: string;
  name: string;
  price_per_ml: number;
  is_default: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
}
