import { useEffect, useMemo, useRef, useState } from "react";
import type { SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type ParticleKind = "flame" | "smoke";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  age: number;
  kind: ParticleKind;
};

type Size = { width: number; height: number };

type MotionStatus = "idle" | "active" | "denied" | "unavailable";

type MicStatus = "idle" | "active" | "denied" | "unavailable";

type CrackleStatus = "idle" | "active" | "unavailable";

type FireSource = {
  id: string;
  relativeX: number;
  relativeY: number;
  age: number;
  ttl: number | null;
  boost: number;
  flameSpawn: number;
  smokeSpawn: number;
};

const MAX_PARTICLES = 480;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Fireplace</strong>
    <p>Old school particle flames with motion and sound boost.</p>
  </article>
);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

const createNoiseBuffer = (ctx: AudioContext, durationSeconds = 0.06) => {
  const length = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * 0.6;
  }
  return buffer;
};

const createFlame = (originX: number, originY: number, wind: number, intensity: number): Particle => {
  const boost = clamp(intensity - 1, 0, 3);
  const sizeBoost = 1 + boost * 0.25;
  const speedBoost = 1 + boost * 0.08;
  const lifeBoost = 1 + boost * 0.12;
  const angle = rand(-Math.PI * 0.65, -Math.PI * 0.35);
  const speed = rand(35, 65) * speedBoost;
  return {
    x: originX + rand(-18, 18),
    y: originY + rand(-4, 4),
    vx: Math.cos(angle) * speed + wind * 20,
    vy: Math.sin(angle) * speed,
    size: rand(6, 14) * sizeBoost,
    life: rand(0.6, 1.1) * lifeBoost,
    age: 0,
    kind: "flame"
  };
};

const createSmoke = (
  originX: number,
  originY: number,
  wind: number,
  intensity: number,
  spread: number
): Particle => {
  const boost = clamp(intensity - 1, 0, 3);
  const sizeBoost = 1 + boost * 0.22;
  const lifeBoost = 1 + boost * 0.35;
  const spreadFactor = 1 + spread * 1.8;
  const angle = rand(-Math.PI * 0.95, -Math.PI * 0.45);
  const speed = rand(16, 28) * (1 + spread * 0.25);
  const lateral = rand(-12, 12) * spreadFactor;
  return {
    x: originX + rand(-20, 20) * spreadFactor,
    y: originY + rand(-6, 6),
    vx: Math.cos(angle) * speed + wind * 15 + lateral,
    vy: Math.sin(angle) * speed,
    size: rand(12, 22) * sizeBoost,
    life: rand(2.2, 3.6) * lifeBoost,
    age: 0,
    kind: "smoke"
  };
};

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#14110d");
  gradient.addColorStop(1, "#2f1f12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width / 2, height * 0.82, 5, width / 2, height * 0.82, height * 0.35);
  glow.addColorStop(0, "rgba(255, 184, 92, 0.35)");
  glow.addColorStop(1, "rgba(255, 184, 92, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, height * 0.5, width, height * 0.5);

  ctx.fillStyle = "#2d1b0f";
  ctx.fillRect(width * 0.18, height * 0.84, width * 0.64, height * 0.08);
  ctx.fillStyle = "#3c2615";
  ctx.fillRect(width * 0.2, height * 0.9, width * 0.6, height * 0.06);
};

const drawParticles = (ctx: CanvasRenderingContext2D, particles: Particle[]) => {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const particle of particles) {
    if (particle.kind !== "flame") continue;
    const progress = particle.age / particle.life;
    const heat = 1 - progress;
    const size = particle.size * (1 + progress * 0.6);
    const alpha = clamp(0.9 * (1 - progress), 0, 0.9);
    const r = Math.round(200 + 55 * heat);
    const g = Math.round(80 + 130 * heat);
    const b = Math.round(20 + 40 * heat);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(particle.x, particle.y, size * 0.7, size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const particle of particles) {
    if (particle.kind !== "smoke") continue;
    const progress = particle.age / particle.life;
    const size = particle.size * (1 + progress * 0.8);
    const alpha = clamp(0.35 * (1 - progress), 0, 0.35);
    const shade = Math.round(90 + 50 * progress);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(particle.x, particle.y, size * 0.8, size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const FireplaceApp = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const sourcesRef = useRef<FireSource[]>([
    {
      id: "base",
      relativeX: 0.5,
      relativeY: 0.82,
      age: 0,
      ttl: null,
      boost: 0,
      flameSpawn: 0,
      smokeSpawn: 0
    }
  ]);
  const sizeRef = useRef<Size>({ width: 320, height: 420 });
  const lastTimeRef = useRef<number | null>(null);
  const windRef = useRef(0);
  const dragRef = useRef<{ active: boolean; lastX: number; lastTime: number }>({
    active: false,
    lastX: 0,
    lastTime: 0
  });
  const motionStatusRef = useRef<MotionStatus>("idle");
  const micLevelRef = useRef(0);
  const uiTickRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array; stream: MediaStream } | null>(null);
  const crackleRef = useRef<{ ctx: AudioContext; gain: GainNode; buffer: AudioBuffer } | null>(null);
  const crackleTimerRef = useRef<number | null>(null);
  const crackleIntensityRef = useRef(0);

  const [motionStatus, setMotionStatus] = useState<MotionStatus>("idle");
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [crackleStatus, setCrackleStatus] = useState<CrackleStatus>("idle");
  const [windStatus, setWindStatus] = useState("still");
  const [micLevel, setMicLevel] = useState(0);
  const [fireCount, setFireCount] = useState(1);
  const [kindlingCount, setKindlingCount] = useState(0);

  const motionSupported = typeof window !== "undefined" && "DeviceMotionEvent" in window;
  const micSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const crackleSupported =
    typeof window !== "undefined" &&
    ("AudioContext" in window || "webkitAudioContext" in (window as typeof window & { webkitAudioContext?: typeof AudioContext }));

  useEffect(() => {
    motionStatusRef.current = motionStatus;
  }, [motionStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(200, rect.width);
      const height = Math.max(240, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sizeRef.current = { width, height };
    };

    resize();
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const lastTime = lastTimeRef.current ?? now;
      const delta = Math.min(0.05, (now - lastTime) / 1000);
      lastTimeRef.current = now;

      const size = sizeRef.current;
      const wind = clamp(windRef.current, -1, 1);
      const micSpread = micLevelRef.current;
      const baseIntensity = 1 + micSpread * 2.2;
      crackleIntensityRef.current = baseIntensity;
      if (crackleRef.current) {
        crackleRef.current.gain.gain.value = clamp(0.03 + baseIntensity * 0.02, 0.02, 0.12);
      }

      const sources = sourcesRef.current;
      for (let index = sources.length - 1; index >= 0; index -= 1) {
        const source = sources[index];
        if (source.ttl !== null) {
          source.age += delta;
          if (source.age >= source.ttl) {
            sources.splice(index, 1);
            continue;
          }
        }

        const intensity = baseIntensity + source.boost;
        const flameRate = 58 * intensity;
        const smokeRate = 18 * (0.7 + intensity * 0.45);

        source.flameSpawn += delta * flameRate;
        source.smokeSpawn += delta * smokeRate;

        const originX = size.width * source.relativeX + wind * 10;
        const originY = size.height * source.relativeY;

        while (source.flameSpawn >= 1) {
          particlesRef.current.push(createFlame(originX, originY, wind, intensity));
          source.flameSpawn -= 1;
        }
        while (source.smokeSpawn >= 1) {
          particlesRef.current.push(createSmoke(originX, originY, wind, intensity, micSpread));
          source.smokeSpawn -= 1;
        }
      }

      if (particlesRef.current.length > MAX_PARTICLES) {
        particlesRef.current.splice(0, particlesRef.current.length - MAX_PARTICLES);
      }

      if (!dragRef.current.active && motionStatusRef.current !== "active") {
        windRef.current *= 0.965;
        if (Math.abs(windRef.current) < 0.01) {
          windRef.current = 0;
        }
      }

      const particles = particlesRef.current;
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += delta;
        if (particle.age >= particle.life) {
          particles.splice(index, 1);
          continue;
        }

        const lift = particle.kind === "flame" ? -24 : -20;
        const drift = particle.kind === "flame" ? 18 : 6;
        particle.vx += wind * drift * delta;
        particle.vx += (Math.random() - 0.5) * (particle.kind === "flame" ? 8 : 4) * delta;
        particle.vy += lift * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        if (particle.kind === "smoke") {
          const spread = micSpread;
          particle.vx += (Math.random() - 0.5) * (6 + spread * 24) * delta;
          particle.vx *= 0.992;
          particle.vy *= 0.996;
        } else {
          particle.vx *= 0.985;
          particle.vy *= 0.99;
        }
      }

      if (audioRef.current) {
        const { analyser, data } = audioRef.current;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = clamp(rms * 2.2, 0, 1);
        micLevelRef.current = level;
        if (now - uiTickRef.current > 200) {
          setMicLevel(Math.round(level * 100));
        }
      } else {
        micLevelRef.current = 0;
        if (now - uiTickRef.current > 200) {
          setMicLevel(0);
        }
      }

      if (now - uiTickRef.current > 200) {
        const windValue = windRef.current;
        const windDirection = windValue > 0.1 ? "right" : windValue < -0.1 ? "left" : "still";
        setWindStatus(`${windDirection} ${Math.round(Math.abs(windValue) * 100)}%`);
        setFireCount(sourcesRef.current.length);
        setKindlingCount(Math.max(0, sourcesRef.current.length - 1));
        uiTickRef.current = now;
      }

      drawBackground(ctx, size.width, size.height);
      drawParticles(ctx, particles);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!motionSupported || motionStatus !== "active") {
      return;
    }

    const handleMotion = (event: DeviceMotionEvent) => {
      const accel = event.accelerationIncludingGravity;
      if (!accel) return;
      const x = accel.x ?? 0;
      const target = clamp(x / 5, -1, 1);
      windRef.current = windRef.current * 0.9 + target * 0.1;
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [motionStatus, motionSupported]);

  useEffect(() => {
    if (micStatus !== "active") {
      if (audioRef.current) {
        audioRef.current.stream.getTracks().forEach((track) => track.stop());
        void audioRef.current.ctx.close();
        audioRef.current = null;
      }
      return;
    }

    if (!micSupported) {
      setMicStatus("unavailable");
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        audioRef.current = { ctx, analyser, data, stream };
      } catch {
        setMicStatus("denied");
      }
    })();
  }, [micStatus, micSupported]);

  useEffect(() => {
    if (crackleStatus !== "active") {
      if (crackleTimerRef.current !== null) {
        window.clearTimeout(crackleTimerRef.current);
        crackleTimerRef.current = null;
      }
      if (crackleRef.current) {
        void crackleRef.current.ctx.close();
        crackleRef.current = null;
      }
      return;
    }

    if (!crackleSupported) {
      setCrackleStatus("unavailable");
      return;
    }

    if (crackleRef.current) {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      setCrackleStatus("unavailable");
      return;
    }

    const ctx = new AudioContextCtor();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    gain.connect(ctx.destination);
    const buffer = createNoiseBuffer(ctx);
    crackleRef.current = { ctx, gain, buffer };
    void ctx.resume();

    const playBurst = () => {
      if (!crackleRef.current) return;
      const { ctx: audioCtx, gain: masterGain, buffer: noiseBuffer } = crackleRef.current;
      const source = audioCtx.createBufferSource();
      source.buffer = noiseBuffer;
      source.playbackRate.value = rand(0.7, 1.4);

      const burstGain = audioCtx.createGain();
      burstGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      burstGain.gain.linearRampToValueAtTime(rand(0.02, 0.08), audioCtx.currentTime + 0.01);
      burstGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + rand(0.06, 0.12));

      source.connect(burstGain);
      burstGain.connect(masterGain);
      source.start();
      source.stop(audioCtx.currentTime + 0.15);
    };

    const schedule = () => {
      if (!crackleRef.current) return;
      const intensity = clamp(crackleIntensityRef.current, 0, 3);
      const baseInterval = clamp(230 - intensity * 40, 70, 230);
      const nextDelay = baseInterval + rand(-20, 40);
      crackleTimerRef.current = window.setTimeout(() => {
        playBurst();
        schedule();
      }, nextDelay);
    };

    schedule();

    return () => {
      if (crackleTimerRef.current !== null) {
        window.clearTimeout(crackleTimerRef.current);
        crackleTimerRef.current = null;
      }
      if (crackleRef.current) {
        void crackleRef.current.ctx.close();
        crackleRef.current = null;
      }
    };
  }, [crackleStatus, crackleSupported]);

  const toggleMotion = async () => {
    if (!motionSupported) {
      setMotionStatus("unavailable");
      return;
    }

    if (motionStatus === "active") {
      setMotionStatus("idle");
      return;
    }

    const motionEvent = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof motionEvent?.requestPermission === "function") {
      try {
        const result = await motionEvent.requestPermission();
        if (result !== "granted") {
          setMotionStatus("denied");
          return;
        }
      } catch {
        setMotionStatus("denied");
        return;
      }
    }

    setMotionStatus("active");
  };

  const toggleMic = () => {
    if (micStatus === "active") {
      setMicStatus("idle");
      return;
    }
    if (!micSupported) {
      setMicStatus("unavailable");
      return;
    }
    setMicStatus("active");
  };

  const toggleCrackle = () => {
    if (crackleStatus === "active") {
      setCrackleStatus("idle");
      return;
    }
    if (!crackleSupported) {
      setCrackleStatus("unavailable");
      return;
    }
    setCrackleStatus("active");
  };

  const addKindling = () => {
    const sources = sourcesRef.current;
    if (sources.length >= 10) {
      let oldestIndex = -1;
      let oldestAge = -1;
      for (let i = 0; i < sources.length; i += 1) {
        const source = sources[i];
        if (source.id === "base") continue;
        if (source.age > oldestAge) {
          oldestAge = source.age;
          oldestIndex = i;
        }
      }
      if (oldestIndex >= 0) {
        sources.splice(oldestIndex, 1);
      }
    }

    const source: FireSource = {
      id: crypto.randomUUID(),
      relativeX: rand(0.28, 0.72),
      relativeY: rand(0.79, 0.86),
      age: 0,
      ttl: rand(14, 24),
      boost: rand(0.6, 1.5),
      flameSpawn: 0,
      smokeSpawn: 0
    };
    sources.push(source);
    setFireCount(sources.length);
    setKindlingCount(Math.max(0, sources.length - 1));
  };

  const motionLabel = useMemo(() => {
    if (motionStatus === "active") return "Disable Motion";
    if (motionStatus === "unavailable") return "Motion Unsupported";
    if (motionStatus === "denied") return "Motion Denied";
    return "Enable Motion";
  }, [motionStatus]);

  const micLabel = useMemo(() => {
    if (micStatus === "active") return "Disable Mic";
    if (micStatus === "unavailable") return "Mic Unsupported";
    if (micStatus === "denied") return "Mic Denied";
    return "Enable Mic";
  }, [micStatus]);

  const crackleLabel = useMemo(() => {
    if (crackleStatus === "active") return "Disable Crackle";
    if (crackleStatus === "unavailable") return "Crackle Unsupported";
    return "Enable Crackle";
  }, [crackleStatus]);

  return (
    <SlapApplicationShell title="Fireplace">
      <SlapApplicationTitle title="Fireplace" />
      <SlapInlineText>Old school particle flames and smoke. Tilt or make noise to stoke the fire.</SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title={motionLabel} onClick={() => void toggleMotion()} disabled={motionStatus === "unavailable"} />
        <SlapActionButton title={micLabel} onClick={toggleMic} disabled={micStatus === "unavailable"} />
        <SlapActionButton title={crackleLabel} onClick={toggleCrackle} disabled={crackleStatus === "unavailable"} />
        <SlapActionButton title="Add Kindling" onClick={addKindling} />
      </div>

      <SlapInlineText>Wind: {windStatus}</SlapInlineText>
      <SlapInlineText>Mic boost: {micStatus === "active" ? `${micLevel}%` : "off"}</SlapInlineText>
      <SlapInlineText>Crackle: {crackleStatus === "active" ? "on" : "off"}</SlapInlineText>
      <SlapInlineText>Fires: {fireCount} (kindling piles: {kindlingCount})</SlapInlineText>

      <div className="fireplace-stage">
        <canvas
          ref={canvasRef}
          className="fireplace-canvas"
          onPointerDown={(event) => {
            dragRef.current.active = true;
            dragRef.current.lastX = event.clientX;
            dragRef.current.lastTime = performance.now();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragRef.current.active) return;
            const now = performance.now();
            const dx = event.clientX - dragRef.current.lastX;
            const dt = Math.max(1, now - dragRef.current.lastTime);
            const velocity = dx / dt;
            const target = clamp(velocity * 1.5, -1, 1);
            windRef.current = windRef.current * 0.7 + target * 0.3;
            dragRef.current.lastX = event.clientX;
            dragRef.current.lastTime = now;
          }}
          onPointerUp={() => {
            dragRef.current.active = false;
          }}
          onPointerCancel={() => {
            dragRef.current.active = false;
          }}
          onPointerLeave={() => {
            dragRef.current.active = false;
          }}
        />
      </div>

      <SlapInlineText>Tip: Drag on the fire to simulate wind. Tap Enable Motion or Enable Mic to grant permissions on mobile.</SlapInlineText>
    </SlapApplicationShell>
  );
};

export const fireplaceManifest: SlapApplicationManifest = {
  id: "fireplace",
  title: "Fireplace",
  author: "Joel",
  description: "Cozy particle fire with motion and sound response.",
  icon: "FIRE",
  Preview,
  Application: FireplaceApp
};
