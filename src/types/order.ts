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
