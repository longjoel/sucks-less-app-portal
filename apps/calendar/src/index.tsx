import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type LocationState =
  | { status: "unknown" }
  | { status: "loading" }
  | { status: "granted"; latitude: number; longitude: number }
  | { status: "denied"; message: string };

type SunTimes = {
  sunriseMinutes: number;
  sunsetMinutes: number;
} | {
  polar: "day" | "night";
};

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Calendar</strong>
    <p>Date, time, moon phase, and optional daylight remaining.</p>
  </article>
);

const MOON_PHASES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent"
] as const;

const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);
const SYNODIC_MONTH_DAYS = 29.530588853;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const mod = (value: number, period: number) => {
  const next = value % period;
  return next < 0 ? next + period : next;
};

const dayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
};

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const localClockFromMinutes = (minutes: number, baseDate: Date) => {
  const normalized = mod(minutes, 1440);
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(Math.floor(normalized));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const moonPhaseFor = (date: Date) => {
  const daysSinceEpoch = (date.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
  const age = mod(daysSinceEpoch, SYNODIC_MONTH_DAYS);
  const phaseFraction = age / SYNODIC_MONTH_DAYS;
  const phaseIndex = Math.floor((phaseFraction * 8) + 0.5) % 8;
  const illumination = Math.round((1 - Math.cos(phaseFraction * 2 * Math.PI)) * 50);

  return {
    name: MOON_PHASES[phaseIndex],
    illumination
  };
};

const sunTimesFor = (date: Date, latitude: number, longitude: number): SunTimes => {
  const lat = clamp(latitude, -89.8, 89.8);
  const n = dayOfYear(date);
  const gamma = (2 * Math.PI / 365) * (n - 1);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const zenith = toRad(90.833);
  const cosHourAngle = (Math.cos(zenith) / (Math.cos(toRad(lat)) * Math.cos(decl))) - Math.tan(toRad(lat)) * Math.tan(decl);

  if (cosHourAngle > 1) return { polar: "night" };
  if (cosHourAngle < -1) return { polar: "day" };

  const hourAngle = toDegrees(Math.acos(cosHourAngle));
  const timezoneHours = -date.getTimezoneOffset() / 60;
  const solarNoon = 720 - 4 * longitude - eqTime + timezoneHours * 60;

  return {
    sunriseMinutes: solarNoon - hourAngle * 4,
    sunsetMinutes: solarNoon + hourAngle * 4
  };
};

const daylightStatus = (date: Date, location: LocationState) => {
  if (location.status !== "granted") {
    return "Location needed for daylight remaining.";
  }

  const sun = sunTimesFor(date, location.latitude, location.longitude);
  if ("polar" in sun) {
    return sun.polar === "day" ? "Polar day: daylight all day." : "Polar night: no daylight today.";
  }

  const nowMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

  if (nowMinutes < sun.sunriseMinutes) {
    return `Daylight has not started. Sunrise at ${localClockFromMinutes(sun.sunriseMinutes, date)}.`;
  }

  if (nowMinutes >= sun.sunsetMinutes) {
    return `No daylight remaining today. Sunset was ${localClockFromMinutes(sun.sunsetMinutes, date)}.`;
  }

  return `${formatMinutes(sun.sunsetMinutes - nowMinutes)} daylight remaining (sunset ${localClockFromMinutes(sun.sunsetMinutes, date)}).`;
};

const CalendarApp = ({ ctx: _ctx }: { ctx: SlapApplicationContext }) => {
  const [now, setNow] = useState(() => new Date());
  const [location, setLocation] = useState<LocationState>({ status: "unknown" });

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocation({ status: "denied", message: "Geolocation is not available in this browser." });
      return;
    }

    setLocation({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: "granted",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        setLocation({ status: "denied", message: error.message || "Location permission denied." });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const moon = useMemo(() => moonPhaseFor(now), [now]);
  const daylight = useMemo(() => daylightStatus(now, location), [location, now]);

  return (
    <SlapApplicationShell title="Calendar">
      <SlapInlineText>Date: {now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</SlapInlineText>
      <SlapInlineText>Time: {now.toLocaleTimeString()}</SlapInlineText>
      <SlapInlineText>Moon: {moon.name} ({moon.illumination}% illuminated)</SlapInlineText>
      <SlapInlineText>Daylight: {daylight}</SlapInlineText>

      {location.status === "granted" ? (
        <SlapInlineText>
          Location: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
        </SlapInlineText>
      ) : null}

      {location.status === "denied" ? <SlapInlineText>Location error: {location.message}</SlapInlineText> : null}

      <div className="slap-button-row">
        <SlapActionButton
          title={location.status === "granted" ? "Refresh Location" : "Enable Location"}
          onClick={requestLocation}
          disabled={location.status === "loading"}
        />
      </div>

      <SlapInlineText>Location is optional, but required for daylight remaining.</SlapInlineText>
    </SlapApplicationShell>
  );
};

export const calendarManifest: SlapApplicationManifest = {
  id: "calendar",
  title: "Calendar",
  author: "Joel",
  description: "Date, time, moon phase, and daylight remaining with optional location.",
  icon: "📅",
  Preview,
  Application: CalendarApp
};
