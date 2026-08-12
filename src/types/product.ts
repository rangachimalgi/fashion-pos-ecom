export interface Product {
    id: string;
    name: string;
    description: string | null;
    brand: string;
    base_price: number;
    image_url: string | null;
    created_at: string;
  }
  
  export interface ProductVariant {
    id: string;
    product_id: string;
    size: 'S' | 'M' | 'L' | 'XL' | 'XXL';
    color: string;
    barcode: string; 
    stock_quantity: number;
    updated_at: string;
  }
  
  export interface CompleteProduct extends Product {
    variants: ProductVariant[];
  }
  