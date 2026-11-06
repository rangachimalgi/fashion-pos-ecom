/**
 * Employee details: cleaning and checking, shared by the admin form (so you
 * get a message before saving) and the server route (which never trusts the
 * browser). The database repeats the same rules as check constraints.
 */

/**
 * An employee logs in with their phone number. Supabase wants an email, so the
 * phone number is turned into one that is never mailed to. Admin and employee
 * screens never show it.
 */
export const LOGIN_EMAIL_DOMAIN = "employee.example.com";

export function employeeLoginEmail(phone: string) {
  return `${phone}@${LOGIN_EMAIL_DOMAIN}`;
}

export const MIN_PASSWORD_LENGTH = 6;

/** Digits only; drops a leading +91 / 91 / 0 so "+91 98765 43210" becomes 9876543210. */
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function normalizeAadhaar(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePan(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

/** "XXXX XXXX 1234": enough to recognise it on a list without showing it all. */
export function maskAadhaar(aadhaar: string | null) {
  return aadhaar ? `XXXX XXXX ${aadhaar.slice(-4)}` : "";
}

export type EmployeeFields = {
  name: string;
  phone: string;
  address: string;
  /** null = not given. */
  aadhaar: string | null;
  pan: string | null;
};

export type EmployeeCheck =
  | { ok: true; value: EmployeeFields }
  | { ok: false; error: string };

type RawFields = {
  name?: unknown;
  phone?: unknown;
  address?: unknown;
  aadhaar?: unknown;
  pan?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function checkEmployeeFields(raw: RawFields): EmployeeCheck {
  const name = text(raw.name).trim().replace(/\s+/g, " ");
  const phone = normalizePhone(text(raw.phone));
  const address = text(raw.address).trim();
  const aadhaarText = normalizeAadhaar(text(raw.aadhaar));
  const panText = normalizePan(text(raw.pan));

  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Enter the employee's name (2 to 80 characters)." };
  }
  if (!/^[0-9]{10}$/.test(phone)) {
    return { ok: false, error: "Enter a 10 digit phone number. It is also their login." };
  }
  if (address.length < 3 || address.length > 300) {
    return { ok: false, error: "Enter the address (3 to 300 characters)." };
  }
  if (aadhaarText && !/^[0-9]{12}$/.test(aadhaarText)) {
    return { ok: false, error: "An Aadhaar number has 12 digits. Leave it empty if you don't have it." };
  }
  if (panText && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panText)) {
    return { ok: false, error: "A PAN looks like ABCDE1234F. Leave it empty if you don't have it." };
  }

  return {
    ok: true,
    value: {
      name,
      phone,
      address,
      aadhaar: aadhaarText || null,
      pan: panText || null,
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sales-team choice from the form: "" = not in the sales team, "new" = in the
 * team under their own name, or the id of an existing sales name to use.
 */
export function checkSalesChoice(
  value: unknown
): { ok: true; value: "" | "new" | string } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: "" };
  if (value === "new") return { ok: true, value: "new" };
  if (typeof value !== "string" || !UUID.test(value)) {
    return { ok: false, error: "Pick the sales team option from the list." };
  }
  return { ok: true, value: value.toLowerCase() };
}

/** null = fine. */
export function checkPassword(value: unknown): string | null {
  const password = typeof value === "string" ? value : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 72) return "The password is too long (72 characters at most).";
  return null;
}
