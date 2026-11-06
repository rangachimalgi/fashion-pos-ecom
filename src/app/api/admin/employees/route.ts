import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AuthError, requireStaff } from "@/lib/serverAuth";
import { SalesTeamError, syncSalesTeam } from "@/lib/employeeSalesServer";
import { checkEmployeeFields, checkPassword, checkSalesChoice, employeeLoginEmail } from "@/lib/employeeValidation";

/** Admin: add an employee (their login and their details). */
export async function POST(request: Request) {
  try {
    await requireStaff(request, ["admin"]);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Send the employee details." }, { status: 400 });
    }

    const fields = checkEmployeeFields(body);
    if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
    const passwordProblem = checkPassword(body.password);
    if (passwordProblem) return NextResponse.json({ error: passwordProblem }, { status: 400 });

    const salesChoice = checkSalesChoice(body.sales_person_id);
    if (!salesChoice.ok) return NextResponse.json({ error: salesChoice.error }, { status: 400 });

    const { name, phone, address, aadhaar, pan } = fields.value;
    const admin = getSupabaseAdmin();


    const { data: taken, error: takenError } = await admin
      .from("employees")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (takenError) throw takenError;
    if (taken) {
      return NextResponse.json({ error: "An employee with this phone number already exists." }, { status: 409 });
    }

    const active = body.active === false ? false : true;
    const sales = await syncSalesTeam(admin, {
      choice: salesChoice.value,
      employeeName: name,
      employeeActive: active,
      employeeId: null,
      currentSalesPersonId: null,
    });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: employeeLoginEmail(phone),
      password: String(body.password),
      email_confirm: true,
      user_metadata: { employee: true, name },
    });
    if (createError || !created.user) {
      await sales.undo();
      const message = createError?.message ?? "Could not create the login";
      if (/already|registered|exists/i.test(message)) {
        return NextResponse.json(
          { error: "A login for this phone number already exists. Use a different number or delete the old login." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: `Could not create the login: ${message}` }, { status: 400 });
    }

    const { data: employee, error: insertError } = await admin
      .from("employees")
      .insert({
        user_id: created.user.id,
        name,
        phone,
        address,
        aadhaar,
        pan,
        active,
        sales_person_id: sales.salesPersonId,
      })
      .select("id, user_id, name, phone, address, aadhaar, pan, active, created_at, sales_person_id")
      .single();

    if (insertError || !employee) {
      // Do not leave a login behind without an employee record.
      await admin.auth.admin.deleteUser(created.user.id);
      await sales.undo();
      if (insertError?.code === "23505") {
        const message = /sales_person/.test(insertError.message)
          ? "Another employee is already linked to that sales name."
          : "An employee with this phone number already exists.";
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw insertError ?? new Error("Insert failed");
    }

    if (body.active === false) {
      await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "876000h" });
    }

    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError || err instanceof SalesTeamError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/employees POST] failed", err);
    return NextResponse.json({ error: "Could not add the employee." }, { status: 500 });
  }
}
