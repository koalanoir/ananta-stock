export type MenuItemSummary = {
  id: string;
  name: string;
  description: string | null;
  type: "dish" | "cocktail" | "drink" | "other";
  selling_price: number;
};

export type RestaurantOrder = {
  id: string;
  order_number: string;
  table_reference: string | null;
  preparation_status: "waiting" | "preparing" | "ready" | "served" | "cancelled";
  payment_status: "unpaid" | "paid";
  invoice_id: string | null;
  created_at: string;
  creator: { full_name: string } | null;
  customer_order_items: {
    id: string;
    menu_item_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    menu_item: { name: string } | null;
  }[];
};
