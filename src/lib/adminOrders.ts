import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminOrder, OrderLineItem } from "@/types/order";

type VariantProduct = {
  name?: string | null;
};

type VariantJoin = {
  size?: string | null;
  color?: string | null;
  products?: VariantProduct | VariantProduct[] | null;
};

type LineRow = {
  variant_id?: string;
  quantity?: number;
  price_at_purchase?: number;
  product_variants?: VariantJoin | VariantJoin[] | null;
};

type OrderRow = {
  id: string;
  total_amount?: number;
  payment_method?: string;
  source?: string;
  created_at?: string | null;
  order_items?: LineRow[] | null;
};

function asProduct(value: VariantJoin["products"]): VariantProduct | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function asVariant(value: LineRow["product_variants"]): VariantJoin | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeLine(row: LineRow): OrderLineItem | null {
  const variantId = row.variant_id ? String(row.variant_id) : "";
  const quantity = Number(row.quantity);
  if (!variantId || !Number.isFinite(quantity)) return null;

  const variant = asVariant(row.product_variants);
  const product = asProduct(variant?.products);

  return {
    variant_id: variantId,
    quantity,
    price_at_purchase: Number(row.price_at_purchase ?? 0),
    product_name: product?.name ?? null,
    size: variant?.size ?? null,
    color: variant?.color ?? null,
  };
}

function looksLikeLineItems(value: unknown): value is LineRow[] {
  return (
    Array.isArray(value) &&
    value.some((item) => item && typeof item === "object" && "variant_id" in item)
  );
}

async function enrichBareLines(
  supabase: SupabaseClient,
  lines: OrderLineItem[]
): Promise<OrderLineItem[]> {
  const missing = lines.filter((line) => !line.product_name);
  if (!missing.length) return lines;

  const variantIds = [...new Set(missing.map((line) => line.variant_id))];
  const { data } = await supabase
    .from("product_variants")
    .select("id, size, color, products(name)")
    .in("id", variantIds);

  const map = new Map(
    ((data ?? []) as Array<{
      id: string;
      size?: string | null;
      color?: string | null;
      products?: VariantProduct | VariantProduct[] | null;
    }>).map((row) => [row.id, row])
  );

  return lines.map((line) => {
    const variant = map.get(line.variant_id);
    if (!variant) return line;
    const product = asProduct(variant.products);
    return {
      ...line,
      product_name: line.product_name ?? product?.name ?? null,
      size: line.size ?? variant.size ?? null,
      color: line.color ?? variant.color ?? null,
    };
  });
}

async function loadItemsForOrders(
  supabase: SupabaseClient,
  orders: OrderRow[]
): Promise<Map<string, OrderLineItem[]>> {
  const itemsByOrder = new Map<string, OrderLineItem[]>();

  for (const order of orders) {
    if (looksLikeLineItems(order.order_items)) {
      itemsByOrder.set(
        order.id,
        order.order_items.map(normalizeLine).filter((item): item is OrderLineItem => !!item)
      );
    }
  }

  const missingIds = orders.map((order) => order.id).filter((id) => !itemsByOrder.has(id));

  if (missingIds.length) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, variant_id, quantity, price_at_purchase, product_variants(size, color, products(name))")
      .in("order_id", missingIds);

    if (!error && data) {
      for (const row of data as Array<LineRow & { order_id?: string }>) {
        const orderId = row.order_id ? String(row.order_id) : "";
        const line = normalizeLine(row);
        if (!orderId || !line) continue;
        const current = itemsByOrder.get(orderId) ?? [];
        current.push(line);
        itemsByOrder.set(orderId, current);
      }
    }
  }

  for (const [orderId, lines] of itemsByOrder) {
    itemsByOrder.set(orderId, await enrichBareLines(supabase, lines));
  }

  return itemsByOrder;
}

function toAdminOrder(order: OrderRow, items: OrderLineItem[]): AdminOrder {
  return {
    id: order.id,
    total_amount: Number(order.total_amount ?? 0),
    payment_method: order.payment_method || "—",
    source: order.source || "—",
    created_at: order.created_at ?? null,
    item_count: items.length,
    items,
  };
}

export async function listAdminOrders(supabase: SupabaseClient): Promise<AdminOrder[]> {
  let { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error && error.message.toLowerCase().includes("created_at")) {
    ({ data, error } = await supabase.from("orders").select("*").order("id", { ascending: false }));
  }

  if (error) {
    const extra =
      error.message.toLowerCase().includes("policy") || error.code === "42501"
        ? "\n\nRun supabase/migrations/005_admin_order_reads.sql in the Supabase SQL Editor."
        : error.message.toLowerCase().includes("does not exist")
          ? "\n\nNo orders table yet. Close a POS invoice or bag checkout once to create it."
          : "";
    throw new Error(error.message + extra);
  }

  const orders = (data ?? []) as OrderRow[];
  const itemsByOrder = await loadItemsForOrders(supabase, orders);

  return orders.map((order) => toAdminOrder(order, itemsByOrder.get(order.id) ?? []));
}

export async function getAdminOrder(
  supabase: SupabaseClient,
  id: string
): Promise<AdminOrder | null> {
  const { data, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();

  if (error) {
    const extra =
      error.message.toLowerCase().includes("policy") || error.code === "42501"
        ? "\n\nRun supabase/migrations/005_admin_order_reads.sql in the Supabase SQL Editor."
        : "";
    throw new Error(error.message + extra);
  }
  if (!data) return null;

  const order = data as OrderRow;
  const itemsByOrder = await loadItemsForOrders(supabase, [order]);
  return toAdminOrder(order, itemsByOrder.get(order.id) ?? []);
}
