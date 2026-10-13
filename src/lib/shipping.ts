import type { ShippingDetails } from "@/types/order";

const PHONE = /^[6-9]\d{9}$/;
const PINCODE = /^\d{6}$/;

export function emptyShipping(): ShippingDetails {
  return {
    customer_name: "",
    customer_phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
  };
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

export function validateShipping(details: ShippingDetails): string | null {
  const name = details.customer_name.trim();
  const phone = normalizePhone(details.customer_phone);
  const line1 = details.address_line1.trim();
  const city = details.city.trim();
  const state = details.state.trim();
  const pincode = details.pincode.trim();

  if (name.length < 2) return "Enter the full name for delivery.";
  if (!PHONE.test(phone)) return "Enter a valid 10-digit Indian mobile number.";
  if (line1.length < 5) return "Enter house / street address.";
  if (city.length < 2) return "Enter city.";
  if (state.length < 2) return "Enter state.";
  if (!PINCODE.test(pincode)) return "Enter a 6-digit pincode.";

  return null;
}

export function normalizedShipping(details: ShippingDetails): ShippingDetails {
  return {
    customer_name: details.customer_name.trim(),
    customer_phone: normalizePhone(details.customer_phone),
    address_line1: details.address_line1.trim(),
    address_line2: details.address_line2.trim(),
    city: details.city.trim(),
    state: details.state.trim(),
    pincode: details.pincode.trim(),
  };
}
