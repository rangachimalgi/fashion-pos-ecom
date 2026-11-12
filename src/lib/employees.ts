import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserSupabase } from "@/lib/supabaseClient";

export type Employee = {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  address: string;
  aadhaar: string | null;
  pan: string | null;
  active: boolean;
  created_at: string;
  /** Sales name whose bills, target and incentive this employee sees. */
  sales_person_id: string | null;
};

export type EmployeeForm = {
  name: string;
  phone: string;
  address: string;
  aadhaar: string;
  pan: string;
  active: boolean;
  /** "" = not linked. */
  sales_person_id: string;
  /** Required when creating; when editing, empty means "keep the password". */
  password: string;
};

export const EMPTY_EMPLOYEE_FORM: EmployeeForm = {
  name: "",
  phone: "",
  address: "",
  aadhaar: "",
  pan: "",
  active: true,
  sales_person_id: "",
  password: "",
};

export function formFromEmployee(employee: Employee): EmployeeForm {
  return {
    name: employee.name,
    phone: employee.phone,
    address: employee.address,
    aadhaar: employee.aadhaar ?? "",
    pan: employee.pan ?? "",
    active: employee.active,
    sales_person_id: employee.sales_person_id ?? "",
    password: "",
  };
}

function friendlyRead(error: { code?: string; message: string }): Error {
  if (error.code === "42703") {
    return new Error("Run supabase/migrations/027_incentives_employee_target.sql in the SQL Editor.");
  }
  if (error.code === "42P01" || error.code === "PGRST205") {
    return new Error("Employees are not set up yet. Run supabase/migrations/024 and 025 in the SQL Editor.");
  }
  return new Error(error.message);
}

/** Admin only (the database refuses everyone else). */
export async function listEmployees(supabase: SupabaseClient): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, user_id, name, phone, address, aadhaar, pan, active, created_at, sales_person_id")
    .order("name", { ascending: true });
  if (error) throw friendlyRead(error);
  return (data ?? []) as Employee[];
}

/** Admin only. null when the id does not exist. */
export async function getEmployee(supabase: SupabaseClient, id: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, user_id, name, phone, address, aadhaar, pan, active, created_at, sales_person_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw friendlyRead(error);
  return (data as Employee | null) ?? null;
}

async function call(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  // Send the signed-in admin's token explicitly. The browser client keeps it fresh;
  // relying on the cookie alone fails once the access token has expired.
  const { data } = await browserSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has ended. Please sign in again.");

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Something went wrong. Please try again.");
  }
  return json;
}

export async function createEmployee(form: EmployeeForm): Promise<Employee> {
  const json = await call("/api/admin/employees", "POST", form);
  return json.employee as Employee;
}

export async function updateEmployee(id: string, form: EmployeeForm): Promise<Employee> {
  const json = await call(`/api/admin/employees/${id}`, "PATCH", form);
  return json.employee as Employee;
}

export async function deleteEmployee(id: string): Promise<void> {
  await call(`/api/admin/employees/${id}`, "DELETE");
}
