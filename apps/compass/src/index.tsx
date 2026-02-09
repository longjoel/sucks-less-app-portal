import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapInlineText } from "@slap/ui";

type PermissionState = "unknown" | "granted" | "denied" | "unsupported";

type IOSOrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const STORAGE_PATH = "compass-state.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Compass</strong>
    <p>Simple heading compass using device orientation sensors.</p>
  </article>
);

const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;

const toDirection = (heading: number) => {
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(heading / 45) % labels.length;
  return labels[index];
};

const CompassApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>("unknown");
  const [statusText, setStatusText] = useState("Tap Start Compass to begin.");
  const [wildSpinMode, setWildSpinMode] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracyMeters: number | null } | null>(null);
  const [locationStatus, setLocationStatus] = useState("Location not started.");

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as { lastHeading?: unknown };
        if (typeof parsed.lastHeading === "number") {
          setHeading(normalizeHeading(parsed.lastHeading));
        }
      } catch {
        // Ignore invalid persisted values.
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(
      STORAGE_PATH,
      JSON.stringify({ lastHeading: heading }, null, 2)
    );
  }, [ctx.vfs, heading]);

  useEffect(() => {
    if (permissionState !== "granted") return;

    let gotReading = false;
    let wildSpinInterval: number | null = null;
    const noDataTimeout = window.setTimeout(() => {
      if (!gotReading) {
        setWildSpinMode(true);
        setStatusText("No heading sensor found. Entering chaos compass mode.");
        wildSpinInterval = window.setInterval(() => {
          setHeading((current) => normalizeHeading((current ?? 0) + 20 + Math.random() * 95));
        }, 90);
      }
    }, 2200);

    const onOrientation = (event: DeviceOrientationEvent) => {
      let nextHeading: number | null = null;
      const webkitEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number };

      if (typeof webkitEvent.webkitCompassHeading === "number") {
        nextHeading = normalizeHeading(webkitEvent.webkitCompassHeading);
      } else if (typeof event.alpha === "number") {
        // Alpha is clockwise from true north in degrees in many browsers.
        nextHeading = normalizeHeading(360 - event.alpha);
      }

      if (nextHeading !== null) {
        gotReading = true;
        setWildSpinMode(false);
        if (wildSpinInterval !== null) {
          window.clearInterval(wildSpinInterval);
          wildSpinInterval = null;
        }
        setHeading(nextHeading);
        setStatusText("Compass active.");
      }
    };

    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.clearTimeout(noDataTimeout);
      if (wildSpinInterval !== null) window.clearInterval(wildSpinInterval);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [permissionState]);

  useEffect(() => {
    if (permissionState !== "granted") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("GPS unavailable on this device/browser.");
      return;
    }

    setLocationStatus("Requesting location...");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
        });
        setLocationStatus("Location active.");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("Location permission denied.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationStatus("Location unavailable.");
        } else if (error.code === error.TIMEOUT) {
          setLocationStatus("Location request timed out.");
        } else {
          setLocationStatus("Unable to read location.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [permissionState]);

  const requestCompass = async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setPermissionState("unsupported");
      setStatusText("Orientation sensors are not supported on this device/browser.");
      return;
    }

    const orientationCtor = DeviceOrientationEvent as IOSOrientationEventCtor;
    if (typeof orientationCtor.requestPermission === "function") {
      try {
        const response = await orientationCtor.requestPermission();
        if (response === "granted") {
          setPermissionState("granted");
          setStatusText("Permission granted. Move your device to calibrate.");
        } else {
          setPermissionState("denied");
          setStatusText("Permission denied. Enable motion/orientation access in browser settings.");
        }
      } catch {
        setPermissionState("denied");
        setStatusText("Permission request failed.");
      }
      return;
    }

    setPermissionState("granted");
    setStatusText("Compass started.");
  };

  const direction = useMemo(() => (heading === null ? "--" : toDirection(heading)), [heading]);
  const headingLabel = useMemo(() => (heading === null ? "--°" : `${Math.round(heading)}°`), [heading]);
  const needleRotation = heading === null ? 0 : heading;
  const latLabel = coords ? coords.lat.toFixed(5) : "--";
  const lonLabel = coords ? coords.lon.toFixed(5) : "--";

  return (
    <section className="slap-shell">
      <SlapInlineText>Basic compass using device orientation sensors.</SlapInlineText>
      <SlapInlineText>Status: {statusText}</SlapInlineText>
      <SlapInlineText>
        Heading: <strong>{headingLabel}</strong> ({direction})
      </SlapInlineText>
      {wildSpinMode ? <SlapInlineText>Demo mode: spinning wildly for dramatic effect.</SlapInlineText> : null}
      <SlapInlineText>
        GPS: <strong>{latLabel}</strong>, <strong>{lonLabel}</strong>
        {coords?.accuracyMeters !== null && coords
          ? ` (±${Math.round(coords.accuracyMeters)}m)`
          : ""}
      </SlapInlineText>
      <SlapInlineText>Location status: {locationStatus}</SlapInlineText>

      <div className="compass-dial-wrap" aria-label="Compass dial">
        <div className="compass-dial">
          <div className="compass-marker compass-n">N</div>
          <div className="compass-marker compass-e">E</div>
          <div className="compass-marker compass-s">S</div>
          <div className="compass-marker compass-w">W</div>
          <div className="compass-needle" style={{ transform: `translate(-50%, -100%) rotate(${needleRotation}deg)` }} />
          <div className="compass-center-dot" />
        </div>
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Start Compass" onClick={() => void requestCompass()} />
      </div>

      {permissionState === "unsupported" ? (
        <SlapInlineText>Tip: Compass support is best on mobile browsers with sensor APIs enabled.</SlapInlineText>
      ) : null}
    </section>
  );
};

export const compassManifest: SlapApplicationManifest = {
  id: "compass",
  title: "Compass",
  author: "Joel",
  description: "Basic heading compass using device orientation sensors.",
  icon: "🧭",
  Preview,
  Application: CompassApp
};
