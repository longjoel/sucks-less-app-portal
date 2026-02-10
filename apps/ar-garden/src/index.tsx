import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type MotionStatus = "idle" | "active" | "denied" | "unavailable";
type CameraStatus = "idle" | "active" | "denied" | "unavailable";
type MusicStatus = "idle" | "active" | "unavailable";
type DetailLevel = "low" | "medium" | "lush";
type GardenItemType = "flower" | "bush" | "tree";

type GardenItem = {
  id: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  hue: number;
  type: GardenItemType;
  sway: number;
};

type AmbientAudio = {
  ctx: AudioContext;
  master: GainNode;
  oscillators: OscillatorNode[];
};

type IOSOrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const DETAIL_COUNTS: Record<DetailLevel, number> = {
  low: 18,
  medium: 30,
  lush: 42
};

const DETAIL_LABELS: Record<DetailLevel, string> = {
  low: "Low",
  medium: "Medium",
  lush: "Lush"
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const toRadians = (value: number) => (value * Math.PI) / 180;
const toHsl = (h: number, s: number, l: number, a = 1) => `hsla(${Math.round(h)}, ${s}%, ${l}%, ${a})`;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>AR Garden</strong>
    <p>Look around a calm, augmented garden with gentle ambient music.</p>
  </article>
);

const createGardenItems = (count: number): GardenItem[] => {
  const items: GardenItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const roll = Math.random();
    const type: GardenItemType = roll < 0.55 ? "flower" : roll < 0.85 ? "bush" : "tree";
    const distance = 2.4 + Math.random() * 6.2;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const y = Math.random() * 0.15;
    const scale =
      type === "tree" ? 1.4 + Math.random() * 1.2 : type === "bush" ? 0.9 + Math.random() * 0.6 : 0.6 + Math.random() * 0.4;
    const hue = 86 + Math.random() * 90;
    items.push({
      id: `garden-${i}-${Math.round(Math.random() * 9999)}`,
      x,
      y,
      z,
      scale,
      hue,
      type,
      sway: Math.random() * Math.PI * 2
    });
  }

  return items;
};

const drawFlower = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hue: number,
  sway: number
) => {
  const stemHeight = size * 3;
  ctx.strokeStyle = toHsl(hue - 40, 36, 34);
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway * 12, y - stemHeight * 0.6, x + sway * 18, y - stemHeight);
  ctx.stroke();

  ctx.fillStyle = toHsl(hue - 30, 38, 38, 0.9);
  ctx.beginPath();
  ctx.ellipse(x + sway * 10, y - stemHeight * 0.55, size * 0.9, size * 0.35, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - sway * 6, y - stemHeight * 0.4, size * 0.8, size * 0.3, 0.6, 0, Math.PI * 2);
  ctx.fill();

  const flowerX = x + sway * 18;
  const flowerY = y - stemHeight;
  ctx.fillStyle = toHsl(hue, 70, 76, 0.95);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      flowerX + Math.cos(angle) * size * 0.8,
      flowerY + Math.sin(angle) * size * 0.45,
      size * 0.7,
      size * 0.38,
      angle,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.fillStyle = toHsl(hue + 15, 70, 56, 0.95);
  ctx.beginPath();
  ctx.arc(flowerX, flowerY, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
};

const drawBush = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, hue: number) => {
  const base = toHsl(hue - 20, 35, 34, 0.95);
  const highlight = toHsl(hue - 10, 40, 42, 0.9);
  const shadow = toHsl(hue - 30, 30, 28, 0.9);
  const bumps = [
    { dx: -size * 0.6, dy: -size * 0.2, r: size * 0.95 },
    { dx: 0, dy: -size * 0.4, r: size * 1.1 },
    { dx: size * 0.7, dy: -size * 0.2, r: size * 0.9 }
  ];

  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.1, size * 1.5, size * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  bumps.forEach((bump, index) => {
    ctx.fillStyle = index === 1 ? base : highlight;
    ctx.beginPath();
    ctx.arc(x + bump.dx, y + bump.dy, bump.r, 0, Math.PI * 2);
    ctx.fill();
  });
};

const drawTree = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hue: number,
  sway: number
) => {
  const trunkHeight = size * 3.2;
  ctx.fillStyle = "rgba(92, 72, 50, 0.95)";
  ctx.fillRect(x - size * 0.25, y - trunkHeight, size * 0.5, trunkHeight);

  const canopyX = x + sway * 10;
  const canopyY = y - trunkHeight;
  const canopyBase = toHsl(hue - 15, 45, 32, 0.9);
  const canopyHighlight = toHsl(hue, 52, 42, 0.9);

  const clusters = [
    { dx: -size * 0.7, dy: -size * 0.2, r: size * 1.1 },
    { dx: 0, dy: -size * 0.6, r: size * 1.35 },
    { dx: size * 0.7, dy: -size * 0.2, r: size * 1.1 }
  ];

  clusters.forEach((cluster, index) => {
    ctx.fillStyle = index === 1 ? canopyHighlight : canopyBase;
    ctx.beginPath();
    ctx.arc(canopyX + cluster.dx, canopyY + cluster.dy, cluster.r, 0, Math.PI * 2);
    ctx.fill();
  });
};

const drawShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.fillStyle = "rgba(20, 26, 18, 0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.2, size * 1.1, size * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
};

const volumeToGain = (value: number) => Math.pow(clamp(value, 0, 100) / 100, 1.4) * 0.3;

const ArGardenApp = ({ ctx: _ctx }: { ctx: SlapApplicationContext }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AmbientAudio | null>(null);
  const itemsRef = useRef<GardenItem[]>([]);
  const metricsRef = useRef({ width: 0, height: 0, dpr: 1 });
  const orientationRef = useRef({ yaw: 0, pitch: 0, roll: 0, baseYaw: 0, hasBase: false });
  const manualRef = useRef({ yaw: 0, pitch: 0 });
  const dragRef = useRef<{ id: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const volumeRef = useRef(35);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [motionStatus, setMotionStatus] = useState<MotionStatus>("idle");
  const [musicStatus, setMusicStatus] = useState<MusicStatus>("idle");
  const [detail, setDetail] = useState<DetailLevel>("low");
  const [volume, setVolume] = useState(35);

  const items = useMemo(() => createGardenItems(DETAIL_COUNTS[detail]), [detail]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) {
      audioRef.current.master.gain.value = volumeToGain(volume);
    }
  }, [volume]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus("active");
    } catch {
      setCameraStatus("denied");
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (cameraStatus === "active") {
      stopCamera();
    } else {
      void startCamera();
    }
  }, [cameraStatus, startCamera, stopCamera]);

  const stopMusic = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.oscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // ignore
      }
    });
    void audioRef.current.ctx.close();
    audioRef.current = null;
    setMusicStatus("idle");
  }, []);

  const startMusic = useCallback(async () => {
    if (audioRef.current) return;
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      setMusicStatus("unavailable");
      return;
    }

    const ctx = new AudioContextCtor();
    const master = ctx.createGain();
    master.gain.value = volumeToGain(volumeRef.current);
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.2;
    filter.connect(master);

    const makePad = (frequency: number, gainValue: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(filter);
      return osc;
    };

    const osc1 = makePad(220, 0.08);
    const osc2 = makePad(330, 0.06);
    const osc3 = makePad(110, 0.04);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect((osc1 as OscillatorNode).detune);
    lfoGain.connect((osc2 as OscillatorNode).detune);

    const filterLfo = ctx.createOscillator();
    filterLfo.type = "sine";
    filterLfo.frequency.value = 0.03;
    const filterGain = ctx.createGain();
    filterGain.gain.value = 120;
    filterLfo.connect(filterGain);
    filterGain.connect(filter.frequency);

    [osc1, osc2, osc3, lfo, filterLfo].forEach((osc) => osc.start());
    await ctx.resume();

    audioRef.current = { ctx, master, oscillators: [osc1, osc2, osc3, lfo, filterLfo] };
    setMusicStatus("active");
  }, []);

  const toggleMusic = useCallback(() => {
    if (musicStatus === "active") {
      stopMusic();
    } else {
      void startMusic();
    }
  }, [musicStatus, startMusic, stopMusic]);

  const toggleMotion = useCallback(async () => {
    if (motionStatus === "active") {
      setMotionStatus("idle");
      return;
    }

    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setMotionStatus("unavailable");
      return;
    }

    const orientationCtor = DeviceOrientationEvent as IOSOrientationEventCtor;
    if (typeof orientationCtor.requestPermission === "function") {
      try {
        const result = await orientationCtor.requestPermission();
        if (result !== "granted") {
          setMotionStatus("denied");
          return;
        }
      } catch {
        setMotionStatus("denied");
        return;
      }
    }

    orientationRef.current.hasBase = false;
    setMotionStatus("active");
  }, [motionStatus]);

  useEffect(() => {
    if (motionStatus !== "active") return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const alpha = typeof event.alpha === "number" ? event.alpha : 0;
      const beta = typeof event.beta === "number" ? event.beta : 0;
      const gamma = typeof event.gamma === "number" ? event.gamma : 0;

      const ref = orientationRef.current;
      if (!ref.hasBase) {
        ref.baseYaw = alpha;
        ref.hasBase = true;
      }

      ref.yaw = toRadians(alpha - ref.baseYaw);
      ref.pitch = clamp(toRadians(beta), toRadians(-45), toRadians(45));
      ref.roll = toRadians(gamma);
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [motionStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastFrame = 0;
    const cameraHeight = 1.4;

    const render = (time: number) => {
      rafId = window.requestAnimationFrame(render);
      const frameInterval = detail === "low" ? 46 : detail === "medium" ? 34 : 28;
      if (time - lastFrame < frameInterval) return;
      lastFrame = time;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const maxDpr = detail === "low" ? 1.2 : 1.5;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const metrics = metricsRef.current;
      if (metrics.width !== rect.width || metrics.height !== rect.height || metrics.dpr !== dpr) {
        metrics.width = rect.width;
        metrics.height = rect.height;
        metrics.dpr = dpr;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const width = metrics.width;
      const height = metrics.height;
      ctx.clearRect(0, 0, width, height);

      if (cameraStatus !== "active") {
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, "#cfe8f1");
        sky.addColorStop(0.5, "#b4d4c1");
        sky.addColorStop(1, "#557b63");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.arc(width * 0.75, height * 0.2, width * 0.18, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(8, 16, 12, 0.12)";
        ctx.fillRect(0, 0, width, height);
      }

      const baseYaw = orientationRef.current.yaw;
      const basePitch = orientationRef.current.pitch;
      const manualYaw = manualRef.current.yaw;
      const manualPitch = manualRef.current.pitch;
      const idleDrift = motionStatus === "active" ? 0 : Math.sin(time * 0.0002) * 0.25;
      const idlePitch = motionStatus === "active" ? 0 : Math.cos(time * 0.00015) * 0.08;
      const yaw = baseYaw + manualYaw + idleDrift;
      const pitch = clamp(basePitch + manualPitch + idlePitch, toRadians(-45), toRadians(45));

      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);

      const horizon = height * 0.52 + pitch * 120;
      const ground = ctx.createLinearGradient(0, horizon, 0, height);
      ground.addColorStop(0, cameraStatus === "active" ? "rgba(38, 72, 54, 0.25)" : "rgba(90, 120, 98, 0.6)");
      ground.addColorStop(1, cameraStatus === "active" ? "rgba(18, 40, 28, 0.55)" : "rgba(30, 60, 42, 0.85)");
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, width, height - horizon);

      const fov = Math.min(width, height) * 0.85;
      const timeSec = time / 1000;

      const projected: Array<{
        item: GardenItem;
        x: number;
        y: number;
        size: number;
        depth: number;
        sway: number;
      }> = [];

      for (const item of itemsRef.current) {
        const relY = item.y - cameraHeight;
        const rotX = item.x * cosYaw + item.z * sinYaw;
        const rotZ = -item.x * sinYaw + item.z * cosYaw;
        const rotY = relY * cosPitch - rotZ * sinPitch;
        const depth = relY * sinPitch + rotZ * cosPitch;

        if (depth < 0.8) continue;

        const perspective = fov / depth;
        const screenX = rotX * perspective + width / 2;
        const screenY = horizon + (-rotY) * perspective;
        const size = clamp(item.scale * perspective, 2, 140);

        if (screenX < -200 || screenX > width + 200 || screenY < -200 || screenY > height + 200) continue;

        const sway = Math.sin(timeSec * 0.6 + item.sway) * 0.1;
        projected.push({ item, x: screenX, y: screenY, size, depth, sway });
      }

      projected.sort((a, b) => a.depth - b.depth);

      for (const node of projected) {
        const swayOffset = node.sway * node.size;
        drawShadow(ctx, node.x, node.y, node.size * 0.5);
        if (node.item.type === "flower") {
          drawFlower(ctx, node.x, node.y, node.size * 0.24, node.item.hue, swayOffset);
        } else if (node.item.type === "bush") {
          drawBush(ctx, node.x, node.y, node.size * 0.3, node.item.hue);
        } else {
          drawTree(ctx, node.x, node.y, node.size * 0.32, node.item.hue, swayOffset);
        }
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(0, 0, width, height);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [cameraStatus, detail, motionStatus]);

  useEffect(() => {
    return () => {
      stopCamera();
      stopMusic();
    };
  }, [stopCamera, stopMusic]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: manualRef.current.yaw,
      pitch: manualRef.current.pitch
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || dragRef.current.id !== event.pointerId) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    manualRef.current.yaw = dragRef.current.yaw + dx * 0.005;
    manualRef.current.pitch = clamp(dragRef.current.pitch + dy * 0.005, -0.8, 0.8);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || dragRef.current.id !== event.pointerId) return;
    dragRef.current = null;
  };

  const cameraLabel =
    cameraStatus === "active"
      ? "Camera on"
      : cameraStatus === "denied"
        ? "Camera permission denied"
        : cameraStatus === "unavailable"
          ? "Camera unavailable"
          : "Camera off";

  const motionLabel =
    motionStatus === "active"
      ? "Motion on"
      : motionStatus === "denied"
        ? "Motion denied"
        : motionStatus === "unavailable"
          ? "Motion unavailable"
          : "Motion off";

  const musicLabel =
    musicStatus === "active"
      ? "Music playing"
      : musicStatus === "unavailable"
        ? "Music unavailable"
        : "Music paused";

  return (
    <SlapApplicationShell title="AR Garden">
      <SlapApplicationTitle title="AR Garden" />
      <SlapInlineText>
        Calm augmented garden for phone-based viewing. Enable motion to look around, and add the camera for a
        see-through backdrop.
      </SlapInlineText>

      <div className={`ar-garden-stage${cameraStatus === "active" ? " is-live" : ""}`} ref={containerRef}>
        <video
          ref={videoRef}
          className="ar-garden-video"
          playsInline
          muted
          autoPlay
          aria-hidden="true"
        />
        <canvas
          ref={canvasRef}
          className="ar-garden-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {cameraStatus !== "active" ? (
          <div className="ar-garden-overlay">
            <strong>Camera off</strong>
            <span>Tap Start Camera for AR mode.</span>
          </div>
        ) : null}
      </div>

      <div className="slap-button-row">
        <SlapActionButton title={cameraStatus === "active" ? "Stop Camera" : "Start Camera"} onClick={toggleCamera} />
        <SlapActionButton
          title={motionStatus === "active" ? "Disable Motion" : "Enable Motion"}
          onClick={toggleMotion}
        />
        <SlapActionButton
          title={musicStatus === "active" ? "Pause Music" : "Play Music"}
          onClick={toggleMusic}
        />
      </div>

      <div className="ar-garden-controls">
        <label className="ar-garden-control">
          <span>Scene detail</span>
          <select className="slap-input" value={detail} onChange={(event) => setDetail(event.target.value as DetailLevel)}>
            {(Object.keys(DETAIL_LABELS) as DetailLevel[]).map((level) => (
              <option key={level} value={level}>
                {DETAIL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="ar-garden-control">
          <span>Music volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </label>
      </div>

      <p className="slap-inline-text ar-garden-status">{cameraLabel} · {motionLabel} · {musicLabel}</p>
      <p className="slap-inline-text ar-garden-hint">
        Tip: Hold your phone steady and gently pan to explore. On desktop, drag the view to look around.
      </p>
    </SlapApplicationShell>
  );
};

export const arGardenManifest: SlapApplicationManifest = {
  id: "ar-garden",
  title: "AR Garden",
  author: "Joel",
  description: "Peaceful augmented garden with gentle music and look-around motion.",
  icon: "🪴",
  Preview,
  Application: ArGardenApp
};
