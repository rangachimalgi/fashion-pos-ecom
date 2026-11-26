"use client";

import { useState } from "react";
import {
  cashValue,
  cleanCounts,
  greedyCounts,
  type CashCounts,
} from "@/lib/cashLedger";

/**
 * State for the cash side of a bill: what the customer handed over and what
 * went back as change. `due` is the bill rounded to the whole rupee.
 *
 * Change fills itself in (fewest notes) until the cashier edits it by hand.
 */
export function useCashTender(due: number, denominations: number[]) {
  const [received, setReceived] = useState<CashCounts>({});
  const [changeOverride, setChangeOverride] = useState<CashCounts | null>(null);

  const receivedTotal = cashValue(received);
  const change = changeOverride ?? greedyCounts(Math.max(0, receivedTotal - due), denominations);
  const changeTotal = cashValue(change);
  const expectedChange = receivedTotal - due;

  let problem: string | null = null;
  if (due > 0 && receivedTotal <= 0) {
    problem = "Enter the notes and coins received from the customer.";
  } else if (expectedChange < 0) {
    problem = `Cash received is ₹${-expectedChange} short of the bill.`;
  } else if (changeTotal !== expectedChange) {
    problem = `Change should be ₹${expectedChange}, but ₹${changeTotal} is entered.`;
  }

  const setCount = (
    which: "received" | "change",
    denomination: number,
    value: number
  ) => {
    const n = Math.max(0, Math.min(100000, Math.floor(Number.isFinite(value) ? value : 0)));
    const key = String(denomination);
    if (which === "received") {
      setReceived((current) => ({ ...current, [key]: n }));
    } else {
      setChangeOverride({ ...change, [key]: n });
    }
  };

  return {
    received,
    change,
    receivedTotal,
    changeTotal,
    expectedChange,
    changeIsManual: changeOverride !== null,
    problem,
    valid: problem === null,
    setCount,
    addOne: (which: "received" | "change", denomination: number) =>
      setCount(
        which,
        denomination,
        ((which === "received" ? received : change)[String(denomination)] ?? 0) + 1
      ),
    exact: () => {
      setReceived(greedyCounts(due, denominations));
      setChangeOverride(null);
    },
    setReceivedAmount: (amount: number) => {
      const n = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
      setReceived(n > 0 ? greedyCounts(n, denominations) : {});
      setChangeOverride(null);
    },
    autoChange: () => setChangeOverride(null),
    clear: () => {
      setReceived({});
      setChangeOverride(null);
    },
    reset: () => {
      setReceived({});
      setChangeOverride(null);
    },
    payload: () => ({ cash_received: cleanCounts(received), cash_change: cleanCounts(change) }),
  };
}

export type CashTenderState = ReturnType<typeof useCashTender>;

function CountGrid({
  denominations,
  counts,
  onAdd,
  onSet,
}: {
  denominations: number[];
  counts: CashCounts;
  onAdd: (denomination: number) => void;
  onSet: (denomination: number, value: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {denominations.map((denomination) => (
        <div
          key={denomination}
          className="overflow-hidden rounded border border-slate-600/80 bg-slate-950/50"
        >
          <button
            type="button"
            onClick={() => onAdd(denomination)}
            title={`Add one ₹${denomination}`}
            className="w-full bg-slate-800/80 py-0.5 font-sans text-[10px] font-semibold text-emerald-300/90 hover:bg-slate-700"
          >
            ₹{denomination}
          </button>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={counts[String(denomination)] ? counts[String(denomination)] : ""}
            placeholder="0"
            onChange={(event) => onSet(denomination, parseInt(event.target.value, 10) || 0)}
            className="h-6 w-full bg-transparent text-center text-xs text-white outline-none placeholder:text-slate-600"
          />
        </div>
      ))}
    </div>
  );
}

export function CashTender({
  due,
  denominations,
  tender,
}: {
  due: number;
  denominations: number[];
  tender: CashTenderState;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900/50 p-2.5">
      <div className="flex items-center justify-between gap-2 font-sans">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Received{" "}
          <span className="tabular-nums text-slate-200">₹{tender.receivedTotal}</span>
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={tender.exact}
            className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-800"
          >
            Exact
          </button>
          <button
            type="button"
            onClick={tender.clear}
            className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-800"
          >
            Clearr
          </button>
        </span>
      </div>

      <CountGrid
        denominations={denominations}
        counts={tender.received}
        onAdd={(d) => tender.addOne("received", d)}
        onSet={(d, v) => tender.setCount("received", d, v)}
      />

      <div className="flex items-center justify-between font-sans">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Change{" "}
          <span className="tabular-nums text-slate-200">₹{tender.changeTotal}</span>
        </span>
        {tender.changeIsManual ? (
          <button
            type="button"
            onClick={tender.autoChange}
            className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-800"
          >
            Auto
          </button>
        ) : (
          <span className="text-[10px] text-slate-600">auto</span>
        )}
      </div>

      <CountGrid
        denominations={denominations}
        counts={tender.change}
        onAdd={(d) => tender.addOne("change", d)}
        onSet={(d, v) => tender.setCount("change", d, v)}
      />

      {!tender.valid && tender.problem ? (
        <p className="font-sans text-[11px] text-amber-300">{tender.problem}</p>
      ) : null}
    </div>
  );
}
