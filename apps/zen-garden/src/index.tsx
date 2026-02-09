import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

const SAND_THEMES = [
  { base: "#ead9b8", shadow: "#d6c19a", highlight: "#f4ead2" },
  { base: "#e6d1aa", shadow: "#c9b089", highlight: "#f5e6c6" },
  { base: "#f0dfc4", shadow: "#d1b792", highlight: "#fff0d8" },
  { base: "#e8d0ac", shadow: "#c9ad84", highlight: "#f7e6c7" }
] as const;
const RAKE_DARK = "rgba(168, 138, 94, 0.55)";
const RAKE_LIGHT = "rgba(245, 237, 219, 0.7)";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const toRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type Stone = {
  id: string;
  x: number;
  y: number;
  radius: number;
  base: string;
  highlight: string;
  shadow: string;
};

type CanvasMetrics = {
  width: number;
  height: number;
  dpr: number;
};

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Zen Garden</strong>
    <p>Rake the sand, place stones, and reset when you need to breathe.</p>
  </article>
);

const createNoisePattern = (size: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);

  for (let i = 0; i < image.data.length; i += 4) {
    const value = 200 + Math.floor(Math.random() * 45);
    image.data[i] = value;
    image.data[i + 1] = value - 6;
    image.data[i + 2] = value - 18;
    image.data[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
};

const drawSandBase = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: { base: string; shadow: string; highlight: string }
) => {
  ctx.save();
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, toRgba(theme.highlight, 0.35));
  gradient.addColorStop(1, toRgba(theme.shadow, 0.25));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const noise = createNoisePattern(140);
  const pattern = ctx.createPattern(noise, "repeat");
  if (pattern) {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
};

const drawStone = (ctx: CanvasRenderingContext2D, stone: Stone) => {
  ctx.save();
  ctx.translate(stone.x, stone.y);
  const gradient = ctx.createRadialGradient(-stone.radius * 0.3, -stone.radius * 0.3, 2, 0, 0, stone.radius);
  gradient.addColorStop(0, stone.highlight);
  gradient.addColorStop(0.6, stone.base);
  gradient.addColorStop(1, stone.shadow);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, stone.radius * 1.1, stone.radius * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "rgba(46, 33, 18, 0.6)";
  ctx.beginPath();
  ctx.ellipse(stone.radius * 0.2, stone.radius * 0.45, stone.radius, stone.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

const drawRakeSegment = (
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  size: number
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return;

  const nx = -dy / length;
  const ny = dx / length;
  const spacing = clamp(size * 0.18, 4, 10);
  const lines = Math.floor(size / spacing);
  const half = (lines * spacing) / 2;

  ctx.lineCap = "round";
  ctx.lineWidth = 1.5;

  for (let i = -lines; i <= lines; i += 1) {
    const offset = i * spacing;
    const shade = i % 2 === 0 ? RAKE_DARK : RAKE_LIGHT;
    ctx.strokeStyle = shade;
    ctx.beginPath();
    ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
    ctx.lineTo(end.x + nx * offset, end.y + ny * offset);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = size * 0.55;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const buildStone = (width: number, height: number): Stone => {
  const radius = 18 + Math.random() * 26;
  const x = clamp(radius + Math.random() * (width - radius * 2), radius + 10, width - radius - 10);
  const y = clamp(radius + Math.random() * (height - radius * 2), radius + 10, height - radius - 10);
  const palette = [
    { base: "#7a6b5b", highlight: "#b7aa9b", shadow: "#4b3f35" },
    { base: "#6b726f", highlight: "#b6c0bb", shadow: "#3f4542" },
    { base: "#5e5c59", highlight: "#a9a59b", shadow: "#3b3531" }
  ];
  const color = palette[Math.floor(Math.random() * palette.length)];
  return {
    id: crypto.randomUUID(),
    x,
    y,
    radius,
    base: color.base,
    highlight: color.highlight,
    shadow: color.shadow
  };
};

const ZenGardenApp = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sandCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rakeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const metricsRef = useRef<CanvasMetrics>({ width: 0, height: 0, dpr: 1 });
  const rakeSizeRef = useRef(34);
  const sandThemeRef = useRef(SAND_THEMES[Math.floor(Math.random() * SAND_THEMES.length)]);
  const activePointerRef = useRef<{ id: number; last: { x: number; y: number } } | null>(null);

  const [rakeSize, setRakeSize] = useState(34);
  const [stones, setStones] = useState<Stone[]>([]);

  const stonesRef = useRef<Stone[]>(stones);
  useEffect(() => {
    stonesRef.current = stones;
  }, [stones]);

  const render = () => {
    const canvas = canvasRef.current;
    const sand = sandCanvasRef.current;
    const rake = rakeCanvasRef.current;
    if (!canvas || !sand || !rake) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, dpr } = metricsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(sand, 0, 0, width, height);
    ctx.drawImage(rake, 0, 0, width, height);

    for (const stone of stonesRef.current) {
      drawStone(ctx, stone);
    }
  };

  const rebuildBase = () => {
    const sand = sandCanvasRef.current;
    if (!sand) return;
    const ctx = sand.getContext("2d");
    if (!ctx) return;
    const { width, height, dpr } = metricsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSandBase(ctx, width, height, sandThemeRef.current);
  };

  const clearRakes = () => {
    const rake = rakeCanvasRef.current;
    if (!rake) return;
    const ctx = rake.getContext("2d");
    if (!ctx) return;
    const { width, height, dpr } = metricsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    render();
  };

  const resizeCanvases = (width: number, height: number) => {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    metricsRef.current = { width, height, dpr };

    const mainCanvas = canvasRef.current;
    if (mainCanvas) {
      mainCanvas.width = Math.floor(width * dpr);
      mainCanvas.height = Math.floor(height * dpr);
      mainCanvas.style.width = `${width}px`;
      mainCanvas.style.height = `${height}px`;
    }

    if (!sandCanvasRef.current) sandCanvasRef.current = document.createElement("canvas");
    if (!rakeCanvasRef.current) rakeCanvasRef.current = document.createElement("canvas");

    for (const canvas of [sandCanvasRef.current, rakeCanvasRef.current]) {
      if (!canvas) continue;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    rebuildBase();
    clearRakes();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      resizeCanvases(width, height);
      render();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    render();
  }, [stones, rakeSize]);

  const addStone = () => {
    const { width, height } = metricsRef.current;
    if (width === 0 || height === 0) return;
    setStones((current) => [...current, buildStone(width, height)].slice(0, 12));
  };

  const clearStones = () => {
    setStones([]);
  };

  const smoothSand = () => {
    clearRakes();
  };

  const newSand = () => {
    const nextTheme = SAND_THEMES.filter((theme) => theme !== sandThemeRef.current);
    sandThemeRef.current = nextTheme[Math.floor(Math.random() * nextTheme.length)] ?? sandThemeRef.current;
    rebuildBase();
    clearRakes();
  };

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = getPoint(event);
    activePointerRef.current = { id: event.pointerId, last: point };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    const rake = rakeCanvasRef.current?.getContext("2d");
    if (!rake) return;

    const point = getPoint(event);
    drawRakeSegment(rake, active.last, point, rakeSizeRef.current);
    active.last = point;
    render();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current?.id === event.pointerId) {
      activePointerRef.current = null;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleRakeSizeChange = (value: number) => {
    rakeSizeRef.current = value;
    setRakeSize(value);
  };

  const instructions = useMemo(
    () => "Drag to rake patterns. Add stones for balance. Smooth to reset.",
    []
  );

  return (
    <SlapApplicationShell title="Zen Garden">
      <SlapApplicationTitle title="Zen Garden" />
      <SlapInlineText>{instructions}</SlapInlineText>

      <div className="zen-garden-stage" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="zen-garden-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="zen-garden-controls">
        <label className="zen-control">
          <span>Rake size</span>
          <input
            type="range"
            min={16}
            max={64}
            step={2}
            value={rakeSize}
            onChange={(event) => handleRakeSizeChange(Number(event.target.value))}
          />
          <span className="zen-control-value">{rakeSize}px</span>
        </label>
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Smooth Sand" onClick={smoothSand} />
        <SlapActionButton title="New Sand" onClick={newSand} />
        <SlapActionButton title="Add Stone" onClick={addStone} />
        <SlapActionButton title="Clear Stones" onClick={clearStones} />
      </div>
    </SlapApplicationShell>
  );
};

export const zenGardenManifest: SlapApplicationManifest = {
  id: "zen-garden",
  title: "Zen Garden",
  author: "Joel",
  description: "Rake the sand, place stones, and reset when you need to breathe.",
  icon: "🪨",
  Preview,
  Application: ZenGardenApp
};
