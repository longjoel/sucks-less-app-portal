import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText, SlapTextInput } from "@slap/ui";

type EmojiItem = {
  id: string;
  type: "emoji";
  x: number;
  y: number;
  emoji: string;
};

type BalloonItem = {
  id: string;
  type: "balloon";
  x: number;
  y: number;
  text: string;
  anchorX: number;
  anchorY: number;
};

type ComicItem = EmojiItem | BalloonItem;

type ComicPage = {
  id: string;
  items: ComicItem[];
};

type DragState = {
  mode: "item" | "anchor";
  itemId: string;
  offsetX: number;
  offsetY: number;
};

type PdfImage = {
  width: number;
  height: number;
  bytes: Uint8Array;
};
type PersistedComic = {
  pages: ComicPage[];
  pageIndex: number;
};

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 640;
const STAGE_PADDING = 24;
const STORAGE_PATH = "emoji-comic-maker-state.json";

const DEFAULT_EMOJIS = ["😀", "😎", "🤖", "👻", "🐱", "🐸", "🚀", "🌈", "🍕", "⚡"];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Emoji Comic Maker</strong>
    <p>Drag emoji and speech balloons across comic pages, then export.</p>
  </article>
);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const toDataBytes = (dataUrl: string) => {
  const payload = dataUrl.split(",")[1] ?? "";
  const raw = atob(payload);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
};

const roundedRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      lines.push(line);
      line = words[i];
    }
  }

  lines.push(line);
  return lines;
};

const getBalloonMetrics = (ctx: CanvasRenderingContext2D, text: string) => {
  ctx.save();
  ctx.font = '24px "Comic Sans MS", "Trebuchet MS", sans-serif';
  const lines = wrapText(ctx, text, 300);
  const lineHeight = 30;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 64);
  const width = clamp(textWidth + 34, 120, 340);
  const height = lines.length * lineHeight + 26;
  ctx.restore();
  return { lines, lineHeight, width, height };
};

const getBalloonTailPath = (balloon: BalloonItem, width: number, height: number) => {
  const centerX = balloon.x;
  const centerY = balloon.y;
  const dx = balloon.anchorX - centerX;
  const dy = balloon.anchorY - centerY;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;

  const edgeScale = 1 / Math.max(Math.abs(dx) / (width / 2), Math.abs(dy) / (height / 2), 1e-6);
  const startX = centerX + dx * edgeScale;
  const startY = centerY + dy * edgeScale;

  // Keep the tail tip away from the anchor target to avoid covering emoji faces.
  const tipInset = 28;
  const tipDistance = Math.max(0, distance - tipInset);
  const endX = centerX + ux * tipDistance;
  const endY = centerY + uy * tipDistance;

  const midX = (startX + endX) / 2 + ux * 8;
  const midY = (startY + endY) / 2 + uy * 8;

  return { startX, startY, midX, midY, endX, endY };
};

const drawBalloonTail = (ctx: CanvasRenderingContext2D, balloon: BalloonItem) => {
  const { width, height } = getBalloonMetrics(ctx, balloon.text);
  const tail = getBalloonTailPath(balloon, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tail.startX, tail.startY);
  ctx.quadraticCurveTo(tail.midX, tail.midY, tail.endX, tail.endY);
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#151515";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
};

const drawBalloonBody = (ctx: CanvasRenderingContext2D, balloon: BalloonItem) => {
  const { lines, lineHeight, width, height } = getBalloonMetrics(ctx, balloon.text);
  const x = balloon.x;
  const y = balloon.y;
  const left = x - width / 2;
  const top = y - height / 2;

  ctx.save();

  roundedRectPath(ctx, left, top, width, height, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#151515";
  ctx.stroke();

  ctx.fillStyle = "#111111";
  ctx.font = '24px "Comic Sans MS", "Trebuchet MS", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    const lineY = top + 18 + lineHeight / 2 + index * lineHeight;
    ctx.fillText(line, x, lineY);
  });

  ctx.restore();
};

const renderPageToCanvas = (page: ComicPage, pageNumber: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#fffef8";
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  ctx.strokeStyle = "#1f2329";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, STAGE_WIDTH - 4, STAGE_HEIGHT - 4);

  ctx.fillStyle = "#f0ece0";
  ctx.fillRect(0, STAGE_HEIGHT - 40, STAGE_WIDTH, 40);
  ctx.fillStyle = "#3f4349";
  ctx.font = '18px "Trebuchet MS", sans-serif';
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`Page ${pageNumber}`, STAGE_WIDTH - 24, STAGE_HEIGHT - 20);

  // Draw tails first so characters/balloons can sit on top of them.
  for (const item of page.items) {
    if (item.type === "balloon") {
      drawBalloonTail(ctx, item);
    }
  }

  for (const item of page.items) {
    if (item.type === "emoji") {
      ctx.save();
      ctx.font = '60px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.emoji, item.x, item.y);
      ctx.restore();
      continue;
    }

    drawBalloonBody(ctx, item);
  }

  return canvas;
};

const buildPdf = (images: PdfImage[]) => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;

  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };

  const objectCount = 2 + images.length * 3;
  const offsets = new Array<number>(objectCount + 1).fill(0);
  const pageRefs: string[] = [];

  push("%PDF-1.4\n%");
  push(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]));
  push("\n");

  const writeObject = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    if (typeof body === "string") {
      push(body);
    } else {
      body.forEach((part) => push(part));
    }
    push("\nendobj\n");
  };

  writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>");

  for (let index = 0; index < images.length; index += 1) {
    const pageId = 3 + index * 3;
    pageRefs.push(`${pageId} 0 R`);
  }

  writeObject(2, `<< /Type /Pages /Count ${images.length} /Kids [${pageRefs.join(" ")}] >>`);

  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;

    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;

    const contentStream = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;

    writeObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );

    writeObject(contentId, `<< /Length ${encoder.encode(contentStream).length} >>\nstream\n${contentStream}endstream`);

    offsets[imageId] = length;
    push(`${imageId} 0 obj\n`);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
    );
    push(image.bytes);
    push("\nendstream\nendobj\n");
  }

  const xrefOffset = length;
  push(`xref\n0 ${objectCount + 1}\n`);
  push("0000000000 65535 f \n");

  for (let id = 1; id <= objectCount; id += 1) {
    push(`${offsets[id].toString().padStart(10, "0")} 00000 n \n`);
  }

  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdf = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  }

  return pdf;
};

const createPage = (): ComicPage => ({
  id: makeId(),
  items: []
});

const isPersistedComic = (value: unknown): value is PersistedComic => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.pages) || typeof candidate.pageIndex !== "number") return false;

  return candidate.pages.every((page) => {
    if (typeof page !== "object" || page === null) return false;
    const p = page as Record<string, unknown>;
    if (typeof p.id !== "string" || !Array.isArray(p.items)) return false;
    return p.items.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const i = item as Record<string, unknown>;
      if (typeof i.id !== "string" || typeof i.x !== "number" || typeof i.y !== "number") return false;
      if (i.type === "emoji") return typeof i.emoji === "string";
      if (i.type === "balloon") {
        return (
          typeof i.text === "string" &&
          typeof i.anchorX === "number" &&
          typeof i.anchorY === "number"
        );
      }
      return false;
    });
  });
};

const EmojiComicMakerApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [pages, setPages] = useState<ComicPage[]>([createPage()]);
  const [pageIndex, setPageIndex] = useState(0);
  const [emojiInput, setEmojiInput] = useState("😀");
  const [balloonInput, setBalloonInput] = useState("Hello there!");
  const [editAnchors, setEditAnchors] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const page = pages[pageIndex];

  const updateCurrentPage = (updater: (page: ComicPage) => ComicPage) => {
    setPages((current) => current.map((entry, index) => (index === pageIndex ? updater(entry) : entry)));
  };

  const logicalPoint = (event: ReactPointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };

    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT;

    return {
      x: clamp(x, STAGE_PADDING, STAGE_WIDTH - STAGE_PADDING),
      y: clamp(y, STAGE_PADDING, STAGE_HEIGHT - STAGE_PADDING)
    };
  };

  const addEmoji = (emoji: string) => {
    const nextEmoji = emoji.trim() || "😀";
    updateCurrentPage((current) => ({
      ...current,
      items: [...current.items, { id: makeId(), type: "emoji", x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2, emoji: nextEmoji }]
    }));
  };

  const addBalloon = () => {
    const text = balloonInput.trim() || "...";
    updateCurrentPage((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: makeId(),
          type: "balloon",
          x: STAGE_WIDTH / 2,
          y: STAGE_HEIGHT / 2,
          text,
          anchorX: STAGE_WIDTH / 2 + 40,
          anchorY: STAGE_HEIGHT / 2 + 120
        }
      ]
    }));
  };

  const onItemPointerDown = (event: ReactPointerEvent, item: ComicItem, mode: "item" | "anchor") => {
    event.preventDefault();
    event.stopPropagation();

    const point = logicalPoint(event);
    const targetX = item.type === "balloon" && mode === "anchor" ? item.anchorX : item.x;
    const targetY = item.type === "balloon" && mode === "anchor" ? item.anchorY : item.y;

    dragRef.current = {
      mode,
      itemId: item.id,
      offsetX: point.x - targetX,
      offsetY: point.y - targetY
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;

    const point = logicalPoint(event);
    const drag = dragRef.current;

    updateCurrentPage((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== drag.itemId) return item;

        if (item.type === "balloon" && drag.mode === "anchor") {
          return {
            ...item,
            anchorX: clamp(point.x - drag.offsetX, STAGE_PADDING, STAGE_WIDTH - STAGE_PADDING),
            anchorY: clamp(point.y - drag.offsetY, STAGE_PADDING, STAGE_HEIGHT - STAGE_PADDING)
          };
        }

        return {
          ...item,
          x: clamp(point.x - drag.offsetX, STAGE_PADDING, STAGE_WIDTH - STAGE_PADDING),
          y: clamp(point.y - drag.offsetY, STAGE_PADDING, STAGE_HEIGHT - STAGE_PADDING)
        };
      })
    }));
  };

  const onStagePointerUp = () => {
    dragRef.current = null;
  };

  const removeLastItem = () => {
    updateCurrentPage((current) => ({ ...current, items: current.items.slice(0, -1) }));
  };

  const addPage = () => {
    setPages((current) => {
      const next = [...current, createPage()];
      setPageIndex(next.length - 1);
      return next;
    });
  };

  const removePage = () => {
    if (pages.length <= 1) return;
    setPages((current) => {
      const next = current.filter((_, index) => index !== pageIndex);
      setPageIndex((old) => clamp(old - 1, 0, next.length - 1));
      return next;
    });
  };

  const exportCurrentPng = async () => {
    const canvas = renderPageToCanvas(page, pageIndex + 1);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `emoji-comic-page-${pageIndex + 1}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportComicPdf = async () => {
    const images: PdfImage[] = pages.map((entry, index) => {
      const canvas = renderPageToCanvas(entry, index + 1);
      const jpeg = canvas.toDataURL("image/jpeg", 0.92);
      return {
        width: canvas.width,
        height: canvas.height,
        bytes: toDataBytes(jpeg)
      };
    });

    const pdfBytes = buildPdf(images);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "emoji-comic.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const pageTitle = useMemo(() => `Page ${pageIndex + 1} of ${pages.length}`, [pageIndex, pages.length]);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) {
        setHasLoaded(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isPersistedComic(parsed) || parsed.pages.length === 0) {
          setHasLoaded(true);
          return;
        }

        setPages(parsed.pages);
        setPageIndex(clamp(parsed.pageIndex, 0, parsed.pages.length - 1));
      } catch {
        // Ignore invalid saved data and start with a fresh comic.
      } finally {
        setHasLoaded(true);
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    if (!hasLoaded) return;
    const payload: PersistedComic = { pages, pageIndex };
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(payload));
  }, [ctx.vfs, hasLoaded, pageIndex, pages]);

  return (
    <SlapApplicationShell title="Emoji Comic Maker">
      <SlapInlineText>{pageTitle}</SlapInlineText>
      <SlapInlineText>Drag emoji and speech balloons onto the panel. Use Edit Anchors to reposition balloon tails.</SlapInlineText>

      <div className="slap-button-row">
        {DEFAULT_EMOJIS.map((emoji) => (
          <button key={emoji} type="button" className="slap-button" onClick={() => addEmoji(emoji)}>
            {emoji}
          </button>
        ))}
      </div>

      <div className="slap-button-row">
        <SlapTextInput label="Custom Emoji" value={emojiInput} onChange={setEmojiInput} />
        <SlapActionButton title="Add Emoji" onClick={() => addEmoji(emojiInput)} />
      </div>

      <div className="slap-button-row">
        <SlapTextInput label="Speech" value={balloonInput} onChange={setBalloonInput} />
        <SlapActionButton title="Add Balloon" onClick={addBalloon} />
        <SlapActionButton title={editAnchors ? "Done Anchors" : "Edit Anchors"} onClick={() => setEditAnchors((v) => !v)} />
      </div>

      <div
        ref={stageRef}
        className="emoji-comic-stage"
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerLeave={onStagePointerUp}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "860px",
          aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}`,
          border: "3px solid #1f2329",
          borderRadius: "12px",
          background: "linear-gradient(180deg, #fffef8 0%, #f8f1df 100%)",
          overflow: "hidden",
          marginTop: "10px"
        }}
      >
        <svg
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {page.items.map((item) =>
            item.type === "balloon" ? (
              <g key={`${item.id}-tail`}>
                <path
                  d={(() => {
                    const metricsCtx = document.createElement("canvas").getContext("2d");
                    if (!metricsCtx) return "";
                    const { width, height } = getBalloonMetrics(metricsCtx, item.text);
                    const tail = getBalloonTailPath(item, width, height);
                    return `M ${tail.startX} ${tail.startY} Q ${tail.midX} ${tail.midY} ${tail.endX} ${tail.endY}`;
                  })()}
                  stroke="#151515"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            ) : null
          )}
        </svg>

        {page.items.map((item) => (
          <div
            key={item.id}
            onPointerDown={(event) => onItemPointerDown(event, item, "item")}
            style={{
              position: "absolute",
              left: `${(item.x / STAGE_WIDTH) * 100}%`,
              top: `${(item.y / STAGE_HEIGHT) * 100}%`,
              transform: "translate(-50%, -50%)",
              touchAction: "none",
              userSelect: "none",
              cursor: "grab"
            }}
          >
            {item.type === "emoji" ? (
              <span
                style={{
                  fontSize: "48px",
                  lineHeight: 1,
                  fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                }}
              >
                {item.emoji}
              </span>
            ) : (
              <div
                style={{
                  position: "relative",
                  minWidth: "120px",
                  maxWidth: "320px",
                  padding: "12px 16px",
                  borderRadius: "16px",
                  border: "3px solid #161616",
                  background: "#ffffff",
                  color: "#151515",
                  fontFamily: '"Comic Sans MS", "Trebuchet MS", sans-serif',
                  fontSize: "20px",
                  textAlign: "center",
                  whiteSpace: "normal"
                }}
              >
                {item.text}
              </div>
            )}
          </div>
        ))}

        {editAnchors
          ? page.items.map((item) =>
              item.type === "balloon" ? (
            <button
              key={`${item.id}-anchor`}
              type="button"
              onPointerDown={(event) => onItemPointerDown(event, item, "anchor")}
              aria-label="Move balloon anchor"
              style={{
                position: "absolute",
                left: `${(item.anchorX / STAGE_WIDTH) * 100}%`,
                top: `${(item.anchorY / STAGE_HEIGHT) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: "18px",
                height: "18px",
                borderRadius: "999px",
                border: "2px solid #48310a",
                background: "#ffcf4a",
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                cursor: "grab",
                touchAction: "none"
              }}
            />
              ) : null
            )
          : null}
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Prev Page" onClick={() => setPageIndex((value) => clamp(value - 1, 0, pages.length - 1))} disabled={pageIndex === 0} />
        <SlapActionButton title="Next Page" onClick={() => setPageIndex((value) => clamp(value + 1, 0, pages.length - 1))} disabled={pageIndex === pages.length - 1} />
        <SlapActionButton title="Add Page" onClick={addPage} />
        <SlapActionButton title="Delete Page" onClick={removePage} disabled={pages.length <= 1} />
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Undo Last Item" onClick={removeLastItem} disabled={page.items.length === 0} />
        <SlapActionButton title="Download PNG" onClick={() => void exportCurrentPng()} />
        <SlapActionButton title="Export Comic PDF" onClick={() => void exportComicPdf()} disabled={pages.length === 0} />
      </div>
    </SlapApplicationShell>
  );
};

export const emojiComicMakerManifest: SlapApplicationManifest = {
  id: "emoji-comic-maker",
  title: "Emoji Comic Maker",
  author: "Joel",
  description: "Build multi-page emoji comics with speech balloons and export to PNG or PDF.",
  icon: "💬",
  Preview,
  Application: EmojiComicMakerApp
};
