export type PaymentMethod = 'CASH' | 'UPI';
export type OrderSource = 'ONLINE' | 'POS';

export interface CheckoutItemInput {
  variant_id: string;
  quantity: number;
  /** POS line price after discount; online omits this and uses MRP. */
  unit_price?: number;
}

export interface ShippingDetails {
  customer_name: string;
  customer_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
}

export interface CheckoutRequest {
  payment_method: PaymentMethod;
  source: OrderSource;
  items: CheckoutItemInput[];
  shipping?: ShippingDetails;
  /** POS only: who attended the customer (ignored for online orders). */
  sales_person_id?: string | null;
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
  brand: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  base_price?: number | null;
  style_code?: string | null;
}

export interface AdminOrder {
  id: string;
  total_amount: number;
  payment_method: PaymentMethod | string;
  source: OrderSource | string;
  created_at: string | null;
  item_count: number;
  items: OrderLineItem[];
  shipping: ShippingDetails | null;
  /** POS bills: the salesperson who attended, as named when the bill was made. */
  sales_person_id: string | null;
  attended_by: string | null;
}
