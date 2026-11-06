import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AuthError, requireStaff } from "@/lib/serverAuth";
import { SalesTeamError, retireSalesName, syncSalesTeam } from "@/lib/employeeSalesServer";
import { checkEmployeeFields, checkPassword, checkSalesChoice, employeeLoginEmail } from "@/lib/employeeValidation";

const COLUMNS = "id, user_id, name, phone, address, aadhaar, pan, active, created_at, sales_person_id";
/** About 100 years: Supabase's way of saying "cannot sign in". */
const BANNED = "876000h";

type Context = { params: Promise<{ id: string }> };

/** Admin: change an employee's details, password, or switch their login on / off. */
export async function PATCH(request: Request, context: Context) {
  try {
    await requireStaff(request, ["admin"]);
    const { id } = await context.params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Send the employee details." }, { status: 400 });
    }

    const fields = checkEmployeeFields(body);
    if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });

    const salesChoice = checkSalesChoice(body.sales_person_id);
    if (!salesChoice.ok) return NextResponse.json({ error: salesChoice.error }, { status: 400 });

    const newPassword = typeof body.password === "string" && body.password !== "" ? body.password : null;
    if (newPassword) {
      const problem = checkPassword(newPassword);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: before, error: readError } = await admin
      .from("employees")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const { name, phone, address, aadhaar, pan } = fields.value;
    const active = body.active === false ? false : true;

    // A request that does not mention the sales team leaves it as it is.
    const sales = await syncSalesTeam(admin, {
      choice: "sales_person_id" in body ? salesChoice.value : (before.sales_person_id ?? ""),
      employeeName: name,
      employeeActive: active,
      employeeId: id,
      currentSalesPersonId: (before.sales_person_id as string | null) ?? null,
      currentEmployeeName: before.name as string,
    });

    // Database first: it rejects a phone number that is already taken, before
    // anything about the login has changed.
    const { data: after, error: updateError } = await admin
      .from("employees")
      .update({
        name,
        phone,
        address,
        aadhaar,
        pan,
        active,
        sales_person_id: sales.salesPersonId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (updateError || !after) {
      await sales.undo();
      if (updateError?.code === "23505") {
        const message = /sales_person/.test(updateError.message)
          ? "Another employee is already linked to that sales name."
          : "Another employee already has this phone number.";
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw updateError ?? new Error("Update failed");
    }

    const revert = async () => {
      await sales.undo();
      await admin
        .from("employees")
        .update({
          name: before.name,
          phone: before.phone,
          address: before.address,
          aadhaar: before.aadhaar,
          pan: before.pan,
          active: before.active,
          sales_person_id: before.sales_person_id,
        })
        .eq("id", id);
    };

    try {
      if (!before.user_id) {
        // The employee exists but their login was removed. A new password brings it back.
        if (newPassword) {
          const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: employeeLoginEmail(phone),
            password: newPassword,
            email_confirm: true,
            user_metadata: { employee: true, name },
          });
          if (createError || !created.user) throw new Error(createError?.message ?? "Could not create the login");
          const { error: linkError } = await admin
            .from("employees")
            .update({ user_id: created.user.id })
            .eq("id", id);
          if (linkError) {
            await admin.auth.admin.deleteUser(created.user.id);
            throw linkError;
          }
          if (!active) await admin.auth.admin.updateUserById(created.user.id, { ban_duration: BANNED });
          after.user_id = created.user.id;
        }
      } else {
        const changes: {
          email?: string;
          password?: string;
          ban_duration?: string;
          user_metadata?: Record<string, unknown>;
        } = {};
        if (phone !== before.phone) changes.email = employeeLoginEmail(phone);
        if (newPassword) changes.password = newPassword;
        if (active !== before.active) changes.ban_duration = active ? "none" : BANNED;
        if (name !== before.name) changes.user_metadata = { employee: true, name };

        if (Object.keys(changes).length > 0) {
          const { error: authError } = await admin.auth.admin.updateUserById(before.user_id, {
            ...changes,
            ...(changes.email ? { email_confirm: true } : {}),
          });
          if (authError) throw authError;
        }
      }
    } catch (err) {
      await revert();
      console.error("[admin/employees PATCH] login update failed", err);
      return NextResponse.json(
        { error: `Could not update the login, nothing was changed. ${err instanceof Error ? err.message : ""}`.trim() },
        { status: 400 }
      );
    }

    return NextResponse.json({ employee: after });
  } catch (err) {
    if (err instanceof AuthError || err instanceof SalesTeamError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/employees PATCH] failed", err);
    return NextResponse.json({ error: "Could not save the employee." }, { status: 500 });
  }
}

/** Admin: delete an employee, their login, attendance and leave history. */
export async function DELETE(request: Request, context: Context) {
  try {
    await requireStaff(request, ["admin"]);
    const { id } = await context.params;

    const admin = getSupabaseAdmin();
    const { data: employee, error: readError } = await admin
      .from("employees")
      .select("id, user_id, sales_person_id")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    // Login first: if this fails the employee is still fully intact.
    if (employee.user_id) {
      const { error: authError } = await admin.auth.admin.deleteUser(employee.user_id);
      if (authError && !/not found/i.test(authError.message)) {
        console.error("[admin/employees DELETE] login delete failed", authError);
        return NextResponse.json({ error: `Could not delete the login: ${authError.message}` }, { status: 500 });
      }
    }

    const { error: deleteError } = await admin.from("employees").delete().eq("id", id);
    if (deleteError) throw deleteError;

    // Their sales name goes too, unless it has bills (then it is only switched off).
    if (employee.sales_person_id) await retireSalesName(admin, employee.sales_person_id as string);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/employees DELETE] failed", err);
    return NextResponse.json({ error: "Could not delete the employee." }, { status: 500 });
  }
}
