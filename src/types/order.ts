export type PaymentMethod = 'CASH' | 'UPI';
export type OrderSource = 'ONLINE' | 'POS';

export interface CheckoutItemInput {
  variant_id: string;
  quantity: number;
}

export interface CheckoutRequest {
  payment_method: PaymentMethod;
  source: OrderSource;
  items: CheckoutItemInput[];
}

export interface CheckoutResponse {
  order_id: string;
  total_amount: number;
}

export interface OrderLineItem {
  variant_id: string;
  quantity: number;
  price_at_purchase: number;
  product_name: string | null;
  size: string | null;
  color: string | null;
}

export interface AdminOrder {
  id: string;
  total_amount: number;
  payment_method: PaymentMethod | string;
  source: OrderSource | string;
  created_at: string | null;
  item_count: number;
  items: OrderLineItem[];
}
