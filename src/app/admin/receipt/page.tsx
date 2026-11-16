"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_RECEIPT_TERMS,
  getReceiptTerms,
  normalizeReceiptTerms,
  setReceiptTerms,
  validateReceiptTerms,
} from "@/lib/receiptSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminReceiptPage() {
  const [lines, setLines] = useState<string[]>([...DEFAULT_RECEIPT_TERMS]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReceiptTerms(supabase)
      .then((terms) => {
        if (cancelled) return;
        setLines(terms.length ? terms : [""]);
        setMissing(false);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load terms";
        if (/033_receipt_terms/i.test(message)) {
          setMissing(true);
          setLines([...DEFAULT_RECEIPT_TERMS]);
        } else {
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateLine = (index: number, value: string) => {
    setLines((current) => current.map((line, i) => (i === index ? value : line)));
  };

  const addLine = () => {
    setLines((current) => (current.length >= 20 ? current : [...current, ""]));
  };

  const removeLine = (index: number) => {
    setLines((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [""];
    });
  };

  const save = async () => {
    const problem = validateReceiptTerms(lines);
    if (problem) {
      setError(problem);
      setNotice(null);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await setReceiptTerms(supabase, lines);
      setLines(saved.length ? saved : [""]);
      setNotice("Saved. New bills will print these terms.");
      setMissing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      if (/033_receipt_terms/i.test(message)) setMissing(true);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const preview = normalizeReceiptTerms(lines);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:px-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Receipt terms</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Printed at the bottom of every POS tax invoice. One line per term.
        </p>
      </div>

      {missing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Run{" "}
          <code className="font-mono text-xs">supabase/migrations/033_receipt_terms.sql</code> in
          the Supabase SQL Editor first.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-white p-4">
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Input
                  value={line}
                  maxLength={160}
                  onChange={(event) => updateLine(index, event.target.value)}
                  placeholder="Term line"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLine(index)}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              disabled={lines.length >= 20}
            >
              <Plus className="size-4" />
              Add line
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving || missing}>
              {saving ? "Saving…" : "Save terms"}
            </Button>
            <button
              type="button"
              onClick={() => setLines([...DEFAULT_RECEIPT_TERMS])}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}

      {preview.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Preview
          </p>
          <ul className="mt-2 space-y-1 text-xs text-foreground">
            {preview.map((term) => (
              <li key={term} className="flex gap-1.5">
                <span aria-hidden>·</span>
                <span>{term}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No terms — the receipt will skip that block.</p>
      )}
    </div>
  );
}
