"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { myEmployee } from "@/lib/attendance";
import { employeeLoginEmail, normalizePhone } from "@/lib/employeeValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const digits = normalizePhone(phone);
      if (digits.length !== 10) throw new Error("Enter your 10 digit phone number.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: employeeLoginEmail(digits),
        password,
      });
      if (signInError) throw new Error("Wrong phone number or password.");

      const employee = await myEmployee(supabase);
      if (!employee) {
        await supabase.auth.signOut();
        throw new Error("This number is not an active employee account. Ask the admin.");
      }

      router.replace("/employee");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Employee sign in</CardTitle>
          <CardDescription>Check in, check out and ask for leave.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
              {error}
            </div>
          ) : null}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone number</label>
              <Input
                required
                inputMode="numeric"
                autoComplete="username"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="10 digits"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <Input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
