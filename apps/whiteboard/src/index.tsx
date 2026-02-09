import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const TOOL_COLORS = {
  black: "#1f1a17",
  red: "#b93838",
  blue: "#2b5fa8",
  eraser: "#ffffff"
} as const;

type Tool = keyof typeof TOOL_COLORS;

type CanvasMetrics = {
  width: number;
  height: number;
  dpr: number;
};

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Whiteboard</strong>
    <p>Sketch ideas with a few markers, erase, and save to PNG.</p>
  </article>
);

const WhiteboardApp = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metricsRef = useRef<CanvasMetrics>({ width: 0, height: 0, dpr: 1 });
  const pointerRef = useRef<{ id: number; last: { x: number; y: number } } | null>(null);
  const toolRef = useRef<Tool>("black");

  const [activeTool, setActiveTool] = useState<Tool>("black");

  useEffect(() => {
    toolRef.current = activeTool;
  }, [activeTool]);

  const getContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  };

  const fillBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const resizeCanvas = (width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prevMetrics = metricsRef.current;
    const prevCanvas = document.createElement("canvas");
    prevCanvas.width = canvas.width;
    prevCanvas.height = canvas.height;
    const prevCtx = prevCanvas.getContext("2d");
    if (prevCtx) {
      prevCtx.drawImage(canvas, 0, 0);
    }

    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    metricsRef.current = { width, height, dpr };

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    fillBackground(ctx, width, height);

    if (prevMetrics.width > 0 && prevMetrics.height > 0) {
      ctx.drawImage(
        prevCanvas,
        0,
        0,
        prevCanvas.width,
        prevCanvas.height,
        0,
        0,
        width,
        height
      );
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      resizeCanvas(width, height);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const ctx = getContext();
    if (!ctx) return;
    const { width, height, dpr } = metricsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    fillBackground(ctx, width, height);
  }, []);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }, tool: Tool) => {
    const ctx = getContext();
    if (!ctx) return;
    const { dpr } = metricsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = TOOL_COLORS[tool];
    ctx.lineWidth = tool === "eraser" ? 18 : 6;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = getPoint(event);
    pointerRef.current = { id: event.pointerId, last: point };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = pointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    const point = getPoint(event);
    drawStroke(active.last, point, toolRef.current);
    active.last = point;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current?.id === event.pointerId) {
      pointerRef.current = null;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const clearCanvas = () => {
    const ctx = getContext();
    if (!ctx) return;
    const { width, height, dpr } = metricsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fillBackground(ctx, width, height);
  };

  const savePng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButtons = useMemo(
    () => [
      { tool: "black" as const, label: "Black" },
      { tool: "red" as const, label: "Red" },
      { tool: "blue" as const, label: "Blue" },
      { tool: "eraser" as const, label: "Eraser" }
    ],
    []
  );

  return (
    <SlapApplicationShell title="Whiteboard">
      <SlapApplicationTitle title="Whiteboard" />
      <SlapInlineText>Pick a marker, draw, erase, or save a PNG.</SlapInlineText>

      <div className="whiteboard-toolbar">
        {toolButtons.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            className={`whiteboard-tool${activeTool === tool ? " is-active" : ""}`}
            onClick={() => setActiveTool(tool)}
          >
            <span className={`whiteboard-swatch is-${tool}`} />
            {label}
          </button>
        ))}
        <SlapActionButton title="Clear" onClick={clearCanvas} />
        <SlapActionButton title="Save PNG" onClick={() => void savePng()} />
      </div>

      <div className="whiteboard-stage" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="whiteboard-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </SlapApplicationShell>
  );
};

export const whiteboardManifest: SlapApplicationManifest = {
  id: "whiteboard",
  title: "Whiteboard",
  author: "Joel",
  description: "Sketch ideas with a few markers, erase, and save to PNG.",
  icon: "📝",
  Preview,
  Application: WhiteboardApp
};
