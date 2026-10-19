export interface Product {
    id: string;
    name: string;
    description: string | null;
    brand: string;
    /** Distributor style SKU, e.g. XYRK0072-W1-82F */
    style_code?: string | null;
    base_price: number;
    image_url: string | null;
    /** Gallery images (up to 6). Primary cover is image_url / first entry. */
    image_urls?: string[] | null;
    /** Product type: Tshirts, Shirts, Jeans, Hoodies */
    category?: string | null;
    /** Department: Men, Women, Kids */
    department?: string | null;
    created_at: string;
  }
  
  export interface ProductVariant {
    id: string;
    product_id: string;
    size: string;
    color: string;
    /** Distributor EAN from the invoice (what a scanner reads). */
    barcode: string; 
    stock_quantity: number;
    updated_at: string;
  }
  
  export interface CompleteProduct extends Product {
    variants: ProductVariant[];
  }
  