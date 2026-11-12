/** Browser geolocation helpers for the shop check-in fence. */

export type PhonePosition = {
  latitude: number;
  longitude: number;
  /** Metres; larger = less sure. null when the phone did not report it. */
  accuracy: number | null;
};

export class GeoError extends Error {
  constructor(
    message: string,
    public code: "unsupported" | "denied" | "unavailable" | "timeout" | "unknown"
  ) {
    super(message);
    this.name = "GeoError";
  }
}

/** Ask the phone for its current position (precise, up to 20s). */
export function getPhonePosition(): Promise<PhonePosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(
      new GeoError("This device cannot share its location. Use a phone with GPS.", "unsupported")
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new GeoError(
              "Location is blocked. Allow location for this site in the browser settings, then try again.",
              "denied"
            )
          );
        } else if (err.code === err.TIMEOUT) {
          reject(new GeoError("Could not get your location in time. Go near a window and try again.", "timeout"));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            new GeoError(
              "Your location is unavailable. Switch on GPS / precise location and try again.",
              "unavailable"
            )
          );
        } else {
          reject(new GeoError(err.message || "Could not get your location.", "unknown"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      }
    );
  });
}

/** Straight-line metres between two points (Haversine). */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function mapsPinUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
