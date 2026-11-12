"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  getAttendanceLocation,
  setAttendanceLocation,
  type AttendanceLocation,
} from "@/lib/attendance";
import { getPhonePosition, mapsPinUrl } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RADIUS_PRESETS = [30, 50, 100, 150];

export function LocationSettings() {
  const [reloadKey, setReloadKey] = useState(0);
  const [settings, setSettings] = useState<AttendanceLocation | null>(null);
  const [missing, setMissing] = useState(false);
  const [radius, setRadius] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAttendanceLocation(supabase)
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setRadius(String(next.radius_m));
        setMissing(false);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load location settings";
        if (/030_checkin_location/i.test(message)) {
          setMissing(true);
          setSettings(null);
        } else {
          setError(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const load = () => setReloadKey((key) => key + 1);

  const radiusValue = Number(radius);
  const radiusOk = Number.isFinite(radiusValue) && radiusValue >= 10 && radiusValue <= 5000;

  const save = async (next: {
    enabled: boolean;
    latitude: number | null;
    longitude: number | null;
    radius_m: number;
  }) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await setAttendanceLocation(supabase, next);
      setNotice(
        next.enabled
          ? `Saved. Location check stays on — employees must be within ${next.radius_m} m until you change this.`
          : "Location check is off. Employees can check in from anywhere."
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const pinHere = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!radiusOk) throw new Error("Enter a radius between 10 and 5000 metres.");
      const pos = await getPhonePosition();
      await save({
        enabled: true,
        latitude: pos.latitude,
        longitude: pos.longitude,
        radius_m: radiusValue,
      });
      setNotice(
        `Shop pin saved${pos.accuracy != null ? ` (phone accuracy about ${Math.round(pos.accuracy)} m)` : ""}. It stays fixed until you move it or turn this off.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read your location");
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Run <code className="font-mono text-xs">supabase/migrations/030_checkin_location.sql</code> in
        the SQL Editor to turn on location check-in.
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
        Loading location settings…
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Check-in location</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Set this once. The shop pin and radius stay saved until you change or turn them off —
            you do not need to do this every day. Admin check-in from this page still works from
            anywhere.
          </p>
        </div>
        <span
          className={
            settings.enabled
              ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
              : "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {settings.enabled ? "On" : "Off"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Radius (metres)
          <Input
            type="number"
            min={10}
            max={5000}
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
            className="h-8 w-28"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RADIUS_PRESETS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={String(value) === radius ? "default" : "outline"}
              onClick={() => setRadius(String(value))}
            >
              {value} m
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        30 m is tight indoors (phone GPS drifts). 50–100 m is usually right for a shop. Max accuracy
        accepted: {settings.max_accuracy_m} m.
      </p>

      {settings.latitude != null && settings.longitude != null ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-mono text-xs tabular-nums">
            {settings.latitude.toFixed(5)}, {settings.longitude.toFixed(5)}
          </span>
          <span className="text-muted-foreground">· within {settings.radius_m} m</span>
          <a
            href={mapsPinUrl(settings.latitude, settings.longitude)}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Open on map
          </a>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No shop pin saved yet.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {settings.latitude == null || settings.longitude == null ? (
          <Button type="button" size="sm" disabled={busy || !radiusOk} onClick={() => void pinHere()}>
            Set shop pin from this phone
          </Button>
        ) : (
          <>
            {!settings.enabled ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || !radiusOk}
                onClick={() =>
                  void save({
                    enabled: true,
                    latitude: settings.latitude,
                    longitude: settings.longitude,
                    radius_m: radiusValue,
                  })
                }
              >
                Turn location check on
              </Button>
            ) : radiusOk && radiusValue !== settings.radius_m ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void save({
                    enabled: true,
                    latitude: settings.latitude,
                    longitude: settings.longitude,
                    radius_m: radiusValue,
                  })
                }
              >
                Save new radius ({radiusValue} m)
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" disabled={busy || !radiusOk} onClick={() => void pinHere()}>
              Move pin to where I am now
            </Button>
            {settings.enabled ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void save({
                    enabled: false,
                    latitude: settings.latitude,
                    longitude: settings.longitude,
                    radius_m: radiusOk ? radiusValue : settings.radius_m,
                  })
                }
              >
                Turn off
              </Button>
            ) : null}
          </>
        )}
      </div>
      {settings.enabled && settings.latitude != null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Already set. Employees keep using this pin every day — only touch the controls above if you
          need a different radius or a new pin.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm whitespace-pre-wrap text-destructive">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
