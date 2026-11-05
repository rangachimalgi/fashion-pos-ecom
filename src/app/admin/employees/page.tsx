"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  EMPTY_EMPLOYEE_FORM,
  createEmployee,
  deleteEmployee,
  formFromEmployee,
  listEmployees,
  updateEmployee,
  type Employee,
  type EmployeeForm,
} from "@/lib/employees";
import { checkEmployeeFields, checkPassword, maskAadhaar, MIN_PASSWORD_LENGTH } from "@/lib/employeeValidation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** null = form closed, "new" = adding, otherwise the id being edited. */
type FormTarget = null | "new" | string;

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [target, setTarget] = useState<FormTarget>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_EMPLOYEE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listEmployees(supabase)
      .then((rows) => {
        if (cancelled) return;
        setEmployees(rows);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the employees");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const openNew = () => {
    setForm(EMPTY_EMPLOYEE_FORM);
    setFormError(null);
    setNotice(null);
    setTarget("new");
  };

  const openEdit = (employee: Employee) => {
    setForm(formFromEmployee(employee));
    setFormError(null);
    setNotice(null);
    setTarget(employee.id);
  };

  const closeForm = () => {
    setTarget(null);
    setFormError(null);
  };

  const setField = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !target) return;

    const fields = checkEmployeeFields(form);
    if (!fields.ok) {
      setFormError(fields.error);
      return;
    }
    const creating = target === "new";
    if (creating || form.password) {
      const problem = checkPassword(form.password);
      if (problem) {
        setFormError(problem);
        return;
      }
    }

    setBusy(true);
    setFormError(null);
    try {
      if (creating) {
        await createEmployee(form);
        setNotice(
          `${fields.value.name} was added. They sign in at /employee/login with phone ${fields.value.phone} and the password you set.`
        );
      } else {
        await updateEmployee(target, form);
        setNotice(`${fields.value.name} was saved.`);
      }
      setTarget(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (employee: Employee) => {
    if (busy) return;
    const sure = window.confirm(
      `Delete ${employee.name}?\n\nThis removes their login and ALL their attendance and leave records. It cannot be undone.\n\nTo stop someone signing in but keep their records, edit them and untick "Can sign in".`
    );
    if (!sure) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteEmployee(employee.id);
      setNotice(`${employee.name} was deleted.`);
      if (target === employee.id) setTarget(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };

  const editing = target && target !== "new" ? employees.find((e) => e.id === target) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-semibold">Employees</h2>
          <p className="text-xs text-muted-foreground">
            Each employee signs in at <span className="font-medium text-foreground">/employee/login</span> with their
            phone number and the password you set. They can only check in / out and ask for leave.
          </p>
        </div>
        <Button type="button" size="sm" className="ml-auto" onClick={openNew} disabled={target === "new"}>
          <Plus className="size-4" />
          Add employee
        </Button>
      </div>

      {notice ? (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {target ? (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {target === "new" ? "New employee" : `Edit ${editing?.name ?? "employee"}`}
          </h3>

          {formError ? (
            <p className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} maxLength={80} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Phone number * (this is their login)
              <Input
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="10 digits"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
              Address *
              <Input value={form.address} onChange={(e) => setField("address", e.target.value)} maxLength={300} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Aadhaar number (optional)
              <Input
                inputMode="numeric"
                value={form.aadhaar}
                onChange={(e) => setField("aadhaar", e.target.value)}
                placeholder="12 digits"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              PAN (optional)
              <Input
                value={form.pan}
                onChange={(e) => setField("pan", e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                maxLength={10}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {target === "new" ? "Password *" : "New password (leave empty to keep the current one)"}
              <Input
                type="text"
                autoComplete="off"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </label>
            {target !== "new" ? (
              <label className="flex items-center gap-2 pt-5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.active}
                  onChange={(e) => setField("active", e.target.checked)}
                />
                Can sign in
              </label>
            ) : null}
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : target === "new" ? "Add employee" : "Save changes"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone (login)</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Aadhaar</TableHead>
              <TableHead>PAN</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  No employees yet. Use “Add employee”.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium whitespace-nowrap">{employee.name}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{employee.phone}</TableCell>
                  <TableCell className="max-w-64 truncate" title={employee.address}>
                    {employee.address}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {maskAadhaar(employee.aadhaar) || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {employee.pan ?? "—"}
                  </TableCell>
                  <TableCell>
                    {employee.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Login off</Badge>
                    )}
                    {!employee.user_id ? (
                      <Badge variant="destructive" className="ml-1">
                        No login
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(employee)} disabled={busy}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>{" "}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => handleDelete(employee)}
                      disabled={busy}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Aadhaar is shown with only the last 4 digits; open Edit to see it in full. Employees cannot see each other,
        the POS, or the admin panel.
      </p>
    </div>
  );
}
