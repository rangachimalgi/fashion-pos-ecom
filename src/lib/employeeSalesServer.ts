import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server only (uses the service-role client). Keeps an employee's sales-team
 * membership in step with the `sales_people` list that the POS reads, so the
 * admin never maintains two lists.
 *
 *   choice ""      -> not in the sales team (their sales name is switched off, bills stay)
 *   choice "new"   -> in the sales team under their own name (re-uses a free sales name
 *                     with the same name, otherwise creates one)
 *   choice <uuid>  -> in the sales team under that existing, unclaimed sales name
 */

export type SalesChoice = "" | "new" | string;

export class SalesTeamError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 409
  ) {
    super(message);
    this.name = "SalesTeamError";
  }
}

export type SalesSync = {
  /** What to store in employees.sales_person_id. */
  salesPersonId: string | null;
  /** Put the sales list back as it was (used when a later step fails). */
  undo: () => Promise<void>;
};

const tidy = (value: string) => value.trim().replace(/\s+/g, " ");

async function claimedBy(admin: SupabaseClient, salesPersonId: string, exceptEmployeeId: string | null) {
  const { data, error } = await admin
    .from("employees")
    .select("id")
    .eq("sales_person_id", salesPersonId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.id !== exceptEmployeeId);
}

export async function syncSalesTeam(
  admin: SupabaseClient,
  input: {
    choice: SalesChoice;
    employeeName: string;
    employeeActive: boolean;
    /** null while creating. */
    employeeId: string | null;
    currentSalesPersonId: string | null;
    currentEmployeeName?: string;
  }
): Promise<SalesSync> {
  const { choice, employeeActive, employeeId, currentSalesPersonId } = input;
  const name = tidy(input.employeeName);
  const undoSteps: Array<() => Promise<void>> = [];
  const undo = async () => {
    for (const step of undoSteps.reverse()) {
      try {
        await step();
      } catch (err) {
        console.error("[syncSalesTeam] undo step failed", err);
      }
    }
  };

  const setActive = async (id: string, active: boolean) => {
    const { data: row, error: readError } = await admin
      .from("sales_people")
      .select("active")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row || row.active === active) return;
    const { error } = await admin.from("sales_people").update({ active }).eq("id", id);
    if (error) throw error;
    undoSteps.push(async () => {
      await admin.from("sales_people").update({ active: row.active }).eq("id", id);
    });
  };

  // Moving off a previous sales name: switch it off, keep its bills.
  const releaseCurrent = async (keepId: string | null) => {
    if (currentSalesPersonId && currentSalesPersonId !== keepId) {
      await setActive(currentSalesPersonId, false);
    }
  };

  try {
    if (choice === "") {
      await releaseCurrent(null);
      return { salesPersonId: null, undo };
    }

    let target: string;

    if (choice === "new") {
      if (currentSalesPersonId) {
        target = currentSalesPersonId;
      } else {
        if (name.length < 2 || name.length > 60) {
          throw new SalesTeamError("A name in the sales team needs 2 to 60 characters.", 400);
        }
        const { data: same, error: sameError } = await admin
          .from("sales_people")
          .select("id")
          .ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`));
        if (sameError) throw sameError;

        let reuse: string | null = null;
        for (const row of same ?? []) {
          if (!(await claimedBy(admin, row.id as string, employeeId))) {
            reuse = row.id as string;
            break;
          }
        }

        if (reuse) {
          target = reuse;
        } else {
          const { data: created, error: createError } = await admin
            .from("sales_people")
            .insert({ name, active: employeeActive })
            .select("id")
            .single();
          if (createError || !created) {
            if (createError?.code === "23505") {
              throw new SalesTeamError(
                `A sales name “${name}” already belongs to another employee. Pick it from the list or change this name.`,
                409
              );
            }
            throw createError ?? new Error("Could not create the sales name");
          }
          target = created.id as string;
          undoSteps.push(async () => {
            await admin.from("sales_people").delete().eq("id", target);
          });
        }
      }
    } else {
      if (!(await admin.from("sales_people").select("id").eq("id", choice).maybeSingle()).data) {
        throw new SalesTeamError("That sales name no longer exists.", 400);
      }
      if (await claimedBy(admin, choice, employeeId)) {
        throw new SalesTeamError("Another employee is already linked to that sales name.", 409);
      }
      target = choice;
    }

    await releaseCurrent(target);
    await setActive(target, employeeActive);

    // Keep the sales name equal to the employee's name when it started out that way.
    if (
      target === currentSalesPersonId &&
      input.currentEmployeeName &&
      tidy(input.currentEmployeeName).toLowerCase() !== name.toLowerCase()
    ) {
      const { data: row } = await admin.from("sales_people").select("name").eq("id", target).maybeSingle();
      if (row && tidy(String(row.name)).toLowerCase() === tidy(input.currentEmployeeName).toLowerCase()) {
        if (name.length >= 2 && name.length <= 60) {
          const { error } = await admin.from("sales_people").update({ name }).eq("id", target);
          if (error && error.code !== "23505") throw error;
          if (!error) {
            const oldName = String(row.name);
            undoSteps.push(async () => {
              await admin.from("sales_people").update({ name: oldName }).eq("id", target);
            });
          }
        }
      }
    }

    return { salesPersonId: target, undo };
  } catch (err) {
    await undo();
    throw err;
  }
}

/** After an employee is deleted: remove their sales name, or switch it off if it has bills. */
export async function retireSalesName(admin: SupabaseClient, salesPersonId: string) {
  const { error } = await admin.from("sales_people").delete().eq("id", salesPersonId);
  if (!error) return;
  if (error.code === "23503") {
    await admin.from("sales_people").update({ active: false }).eq("id", salesPersonId);
    return;
  }
  console.error("[retireSalesName] failed", error);
}
