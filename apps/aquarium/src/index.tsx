import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type FishType = "yellow" | "red" | "blue" | "orange";

type Fish = {
  id: string;
  type: FishType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  hunger: number;
  wiggle: number;
  wiggleSpeed: number;
  followId: string | null;
  boredTimer: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitCenterX: number;
  orbitCenterY: number;
};

type Food = {
  id: string;
  x: number;
  y: number;
  vy: number;
  size: number;
  age: number;
};

type Bubble = {
  id: string;
  x: number;
  y: number;
  vy: number;
  size: number;
  age: number;
  ttl: number;
};

type Poke = {
  id: string;
  x: number;
  y: number;
  strength: number;
  age: number;
  ttl: number;
};

type Size = { width: number; height: number };

type DragState = {
  active: boolean;
  lastX: number;
  lastY: number;
  lastTime: number;
};

const MAX_FISH = 10;
const MAX_FOOD = 18;
const MAX_BUBBLES = 120;
const MAX_POKES = 8;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Aquarium</strong>
    <p>Relaxing fish tank with feeding and poke play.</p>
  </article>
);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

const FISH_TYPES: FishType[] = ["yellow", "red", "blue", "orange"];
const FISH_HUES: Record<FishType, number> = {
  yellow: 52,
  red: 6,
  blue: 200,
  orange: 26
};

const createFish = (width: number, height: number): Fish => {
  const type = FISH_TYPES[Math.floor(Math.random() * FISH_TYPES.length)] ?? "yellow";
  const size = rand(14, 22);
  const orbitCenterX = rand(width * 0.25, width * 0.75);
  const orbitCenterY = rand(height * 0.32, height * 0.74);
  return {
    id: crypto.randomUUID(),
    type,
    x: rand(size * 2, width - size * 2),
    y: rand(height * 0.2, height * 0.78),
    vx: rand(-14, 14),
    vy: rand(-6, 6),
    size,
    hue: clamp(FISH_HUES[type] + rand(-12, 12), 0, 360),
    hunger: rand(0, 0.4),
    wiggle: rand(0, Math.PI * 2),
    wiggleSpeed: rand(1.2, 2.2),
    followId: null,
    boredTimer: rand(4, 8),
    orbitAngle: rand(0, Math.PI * 2),
    orbitSpeed: rand(0.6, 1.1),
    orbitRadius: rand(size * 2.4, size * 4.6),
    orbitCenterX,
    orbitCenterY
  };
};

const createFood = (width: number): Food => ({
  id: crypto.randomUUID(),
  x: rand(width * 0.15, width * 0.85),
  y: rand(-10, 20),
  vy: rand(18, 32),
  size: rand(3, 5),
  age: 0
});

const createBubble = (width: number, height: number): Bubble => ({
  id: crypto.randomUUID(),
  x: rand(width * 0.1, width * 0.9),
  y: rand(height * 0.7, height * 0.95),
  vy: rand(12, 24),
  size: rand(2, 6),
  age: 0,
  ttl: rand(5, 10)
});

const createPoke = (x: number, y: number, strength: number): Poke => ({
  id: crypto.randomUUID(),
  x,
  y,
  strength,
  age: 0,
  ttl: 0.6
});

const findClosestFood = (fish: Fish, foods: Food[]) => {
  let closest: Food | null = null;
  let closestDist = Infinity;

  for (const food of foods) {
    const dx = food.x - fish.x;
    const dy = food.y - fish.y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closest = food;
    }
  }

  if (!closest) return null;
  const dx = closest.x - fish.x;
  const dy = closest.y - fish.y;
  const dist = Math.sqrt(closestDist) || 1;
  return { food: closest, dx, dy, dist };
};

const findNearestFish = (fish: Fish, fishes: Fish[], predicate: (candidate: Fish) => boolean) => {
  let target: Fish | null = null;
  let closestDist = Infinity;

  for (const candidate of fishes) {
    if (candidate.id === fish.id || !predicate(candidate)) continue;
    const dx = candidate.x - fish.x;
    const dy = candidate.y - fish.y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      target = candidate;
    }
  }

  if (!target) return null;
  const dx = target.x - fish.x;
  const dy = target.y - fish.y;
  const dist = Math.sqrt(closestDist) || 1;
  return { target, dx, dy, dist };
};

const findNearestFishToPoint = (x: number, y: number, fishes: Fish[], predicate: (candidate: Fish) => boolean) => {
  let target: Fish | null = null;
  let closestDist = Infinity;

  for (const candidate of fishes) {
    if (!predicate(candidate)) continue;
    const dx = candidate.x - x;
    const dy = candidate.y - y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      target = candidate;
    }
  }

  if (!target) return null;
  const dx = target.x - x;
  const dy = target.y - y;
  const dist = Math.sqrt(closestDist) || 1;
  return { target, dx, dy, dist };
};

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0b2e4a");
  gradient.addColorStop(0.55, "#0f3f5f");
  gradient.addColorStop(1, "#0e2733");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const light = ctx.createRadialGradient(width * 0.35, height * 0.2, 10, width * 0.35, height * 0.2, width * 0.6);
  light.addColorStop(0, "rgba(122, 191, 255, 0.25)");
  light.addColorStop(1, "rgba(122, 191, 255, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#163b2d";
  ctx.fillRect(width * 0.08, height * 0.72, width * 0.02, height * 0.18);
  ctx.fillRect(width * 0.12, height * 0.68, width * 0.015, height * 0.22);
  ctx.fillRect(width * 0.87, height * 0.7, width * 0.02, height * 0.2);

  ctx.fillStyle = "#2f4f2f";
  ctx.fillRect(width * 0.09, height * 0.8, width * 0.05, height * 0.12);
  ctx.fillRect(width * 0.86, height * 0.78, width * 0.04, height * 0.14);

  ctx.fillStyle = "#2e2a24";
  ctx.fillRect(0, height * 0.88, width, height * 0.12);
  ctx.fillStyle = "#3a332c";
  ctx.fillRect(0, height * 0.9, width, height * 0.1);
};

const drawBubble = (ctx: CanvasRenderingContext2D, bubble: Bubble) => {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
  ctx.stroke();
};

const drawFood = (ctx: CanvasRenderingContext2D, food: Food) => {
  ctx.fillStyle = "#c8a96b";
  ctx.beginPath();
  ctx.arc(food.x, food.y, food.size, 0, Math.PI * 2);
  ctx.fill();
};

const drawFish = (ctx: CanvasRenderingContext2D, fish: Fish) => {
  const direction = fish.vx >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.scale(direction, 1);

  const bodyColor = `hsl(${fish.hue}, 70%, 55%)`;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, fish.size * 1.4, fish.size, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `hsl(${fish.hue}, 70%, 45%)`;
  ctx.beginPath();
  ctx.moveTo(-fish.size * 1.4, 0);
  ctx.lineTo(-fish.size * 2.2, fish.size * 0.6);
  ctx.lineTo(-fish.size * 2.2, -fish.size * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(fish.size * 0.7, -fish.size * 0.2, fish.size * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1b1b1b";
  ctx.beginPath();
  ctx.arc(fish.size * 0.75, -fish.size * 0.2, fish.size * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

const AquariumApp = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const sizeRef = useRef<Size>({ width: 320, height: 420 });
  const fishRef = useRef<Fish[]>([]);
  const foodRef = useRef<Food[]>([]);
  const bubbleRef = useRef<Bubble[]>([]);
  const pokesRef = useRef<Poke[]>([]);
  const currentRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<DragState>({ active: false, lastX: 0, lastY: 0, lastTime: 0 });
  const uiTickRef = useRef(0);

  const [status, setStatus] = useState("Tap Feed to drop pellets. Poke the glass to scatter fish.");
  const [fishCount, setFishCount] = useState(0);
  const [foodCount, setFoodCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(240, rect.width);
      const height = Math.max(260, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sizeRef.current = { width, height };

      if (fishRef.current.length === 0) {
        const fish = Array.from({ length: 7 }, () => createFish(width, height));
        fishRef.current = fish;
        setFishCount(fish.length);
      }
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
      const fish = fishRef.current;
      const foods = foodRef.current;
      const bubbles = bubbleRef.current;
      const pokes = pokesRef.current;

      currentRef.current.x *= 0.95;
      currentRef.current.y *= 0.95;
      if (Math.abs(currentRef.current.x) < 0.01) currentRef.current.x = 0;
      if (Math.abs(currentRef.current.y) < 0.01) currentRef.current.y = 0;

      if (Math.random() < 0.4) {
        bubbles.push(createBubble(size.width, size.height));
        if (bubbles.length > MAX_BUBBLES) bubbles.shift();
      }

      for (let index = bubbles.length - 1; index >= 0; index -= 1) {
        const bubble = bubbles[index];
        bubble.age += delta;
        bubble.y -= bubble.vy * delta;
        bubble.x += Math.sin(bubble.age * 2) * 0.2;
        if (bubble.age > bubble.ttl || bubble.y < -20) {
          bubbles.splice(index, 1);
        }
      }

      for (let index = foods.length - 1; index >= 0; index -= 1) {
        const food = foods[index];
        food.age += delta;
        food.y += food.vy * delta;
        if (food.y > size.height * 0.88) {
          foods.splice(index, 1);
        }
      }

      for (let index = pokes.length - 1; index >= 0; index -= 1) {
        const poke = pokes[index];
        poke.age += delta;
        if (poke.age > poke.ttl) {
          pokes.splice(index, 1);
        }
      }

      for (const fishy of fish) {
        fishy.hunger = clamp(fishy.hunger + delta * 0.02, 0, 1);
        fishy.wiggle += delta * fishy.wiggleSpeed;

        const hasFood = foods.length > 0;
        const closestFood = hasFood ? findClosestFood(fishy, foods) : null;
        const wanderX = Math.cos(fishy.wiggle) * 6;
        const wanderY = Math.sin(fishy.wiggle * 0.7) * 3;

        let targetVx = 0;
        let targetVy = 0;

        if (fishy.type === "yellow") {
          if (closestFood) {
            const speed = 16 + fishy.hunger * 20;
            targetVx = (closestFood.dx / closestFood.dist) * speed;
            targetVy = (closestFood.dy / closestFood.dist) * speed;
          }
        } else if (fishy.type === "red") {
          fishy.boredTimer -= delta;
          let targetFish = fishy.followId ? fish.find((candidate) => candidate.id === fishy.followId) ?? null : null;
          if (!targetFish || fishy.boredTimer <= 0) {
            const choices = fish.filter((candidate) => candidate.id !== fishy.id);
            targetFish = choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)] ?? null : null;
            fishy.followId = targetFish?.id ?? null;
            fishy.boredTimer = rand(4, 8);
          }

          if (targetFish) {
            const dx = targetFish.x - fishy.x;
            const dy = targetFish.y - fishy.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = dist > fishy.size * 1.6 ? 14 : 4;
            targetVx = (dx / dist) * speed;
            targetVy = (dy / dist) * speed;
          } else {
            targetVx = wanderX;
            targetVy = wanderY;
          }
        } else if (fishy.type === "blue") {
          if (closestFood) {
            const bullyTarget = findNearestFishToPoint(
              closestFood.food.x,
              closestFood.food.y,
              fish,
              (candidate) => candidate.type !== "blue" && candidate.id !== fishy.id
            );
            if (bullyTarget && bullyTarget.dist < 140) {
              const dx = bullyTarget.target.x - fishy.x;
              const dy = bullyTarget.target.y - fishy.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const speed = 22;
              targetVx = (dx / dist) * speed;
              targetVy = (dy / dist) * speed;
            } else {
              const speed = 18 + fishy.hunger * 12;
              targetVx = (closestFood.dx / closestFood.dist) * speed;
              targetVy = (closestFood.dy / closestFood.dist) * speed;
            }
          } else {
            const buddy = findNearestFish(fishy, fish, (candidate) => candidate.type === "blue");
            if (buddy) {
              const desired = 28;
              const offset = buddy.dist - desired;
              const speed = clamp(offset * 0.4, -10, 10);
              targetVx = (buddy.dx / buddy.dist) * speed;
              targetVy = (buddy.dy / buddy.dist) * speed;
            } else {
              targetVx = wanderX;
              targetVy = wanderY;
            }
          }
        } else if (fishy.type === "orange") {
          fishy.orbitAngle += delta * fishy.orbitSpeed;
          const minX = fishy.size * 3;
          const maxX = size.width - fishy.size * 3;
          const minY = fishy.size * 2.5;
          const maxY = size.height * 0.78;
          fishy.orbitCenterX = clamp(fishy.orbitCenterX + Math.sin(fishy.wiggle * 0.2) * 0.08, minX, maxX);
          fishy.orbitCenterY = clamp(fishy.orbitCenterY + Math.cos(fishy.wiggle * 0.18) * 0.06, minY, maxY);
          const targetX = fishy.orbitCenterX + Math.cos(fishy.orbitAngle) * fishy.orbitRadius;
          const targetY = fishy.orbitCenterY + Math.sin(fishy.orbitAngle) * fishy.orbitRadius * 0.6;
          const dx = targetX - fishy.x;
          const dy = targetY - fishy.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = 12;
          targetVx = (dx / dist) * speed;
          targetVy = (dy / dist) * speed;
        } else {
          targetVx = wanderX;
          targetVy = wanderY;
        }

        if (hasFood && fishy.type !== "blue") {
          const bully = findNearestFish(fishy, fish, (candidate) => candidate.type === "blue");
          if (bully && bully.dist < 120) {
            const force = (1 - bully.dist / 120) * 22;
            targetVx += (-bully.dx / bully.dist) * force;
            targetVy += (-bully.dy / bully.dist) * force;
          }
        }

        for (const poke of pokes) {
          const dx = fishy.x - poke.x;
          const dy = fishy.y - poke.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 120) {
            const force = (1 - dist / 120) * poke.strength * 80;
            targetVx += (dx / dist) * force;
            targetVy += (dy / dist) * force;
          }
        }

        targetVx += currentRef.current.x * 40;
        targetVy += currentRef.current.y * 24;

        fishy.vx += (targetVx - fishy.vx) * 0.08;
        fishy.vy += (targetVy - fishy.vy) * 0.08;

        fishy.x += fishy.vx * delta;
        fishy.y += fishy.vy * delta;

        const margin = fishy.size * 2.2;
        if (fishy.x < margin) {
          fishy.x = margin;
          fishy.vx = Math.abs(fishy.vx);
        }
        if (fishy.x > size.width - margin) {
          fishy.x = size.width - margin;
          fishy.vx = -Math.abs(fishy.vx);
        }
        if (fishy.y < margin) {
          fishy.y = margin;
          fishy.vy = Math.abs(fishy.vy);
        }
        if (fishy.y > size.height * 0.86) {
          fishy.y = size.height * 0.86;
          fishy.vy = -Math.abs(fishy.vy);
        }

        for (let index = foods.length - 1; index >= 0; index -= 1) {
          const food = foods[index];
          const dx = food.x - fishy.x;
          const dy = food.y - fishy.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < (fishy.size * 1.4) ** 2) {
            foods.splice(index, 1);
            fishy.hunger = clamp(fishy.hunger - 0.5, 0, 1);
            break;
          }
        }
      }

      if (now - uiTickRef.current > 250) {
        setFishCount(fish.length);
        setFoodCount(foods.length);
        uiTickRef.current = now;
      }

      drawBackground(ctx, size.width, size.height);
      for (const bubble of bubbles) drawBubble(ctx, bubble);
      for (const food of foods) drawFood(ctx, food);
      for (const fishy of fish) drawFish(ctx, fishy);

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

  const feed = () => {
    const size = sizeRef.current;
    const pellets = Math.floor(rand(5, 10));
    for (let i = 0; i < pellets; i += 1) {
      if (foodRef.current.length >= MAX_FOOD) break;
      foodRef.current.push(createFood(size.width));
    }
    setStatus("Pellets dropped. Fish are on the way.");
    setFoodCount(foodRef.current.length);
  };

  const addFish = () => {
    const size = sizeRef.current;
    if (fishRef.current.length >= MAX_FISH) return;
    fishRef.current.push(createFish(size.width, size.height));
    setFishCount(fishRef.current.length);
    setStatus("A new fish joined the tank.");
  };

  const clearFood = () => {
    foodRef.current = [];
    setFoodCount(0);
  };

  const pokeAt = (x: number, y: number, velocity: number) => {
    const strength = clamp(0.4 + velocity * 0.8, 0.3, 1.6);
    pokesRef.current.push(createPoke(x, y, strength));
    if (pokesRef.current.length > MAX_POKES) pokesRef.current.shift();
  };

  const getLocalPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  return (
    <SlapApplicationShell title="Aquarium">
      <SlapApplicationTitle title="Aquarium" />
      <SlapInlineText>Half screensaver, half playset. Feed the fish or poke the glass to stir them.</SlapInlineText>
      <SlapInlineText>{status}</SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title="Feed" onClick={feed} />
        <SlapActionButton title="Add Fish" onClick={addFish} disabled={fishRef.current.length >= MAX_FISH} />
        <SlapActionButton title="Clear Food" onClick={clearFood} disabled={foodCount === 0} />
      </div>

      <SlapInlineText>
        Fish: {fishCount} · Food pellets: {foodCount}
      </SlapInlineText>

      <div className="aquarium-stage">
        <canvas
          ref={canvasRef}
          className="aquarium-canvas"
          onPointerDown={(event) => {
            dragRef.current.active = true;
            dragRef.current.lastX = event.clientX;
            dragRef.current.lastY = event.clientY;
            dragRef.current.lastTime = performance.now();
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = getLocalPoint(event);
            pokeAt(point.x, point.y, 0.6);
          }}
          onPointerMove={(event) => {
            if (!dragRef.current.active) return;
            const now = performance.now();
            const dx = event.clientX - dragRef.current.lastX;
            const dy = event.clientY - dragRef.current.lastY;
            const dt = Math.max(1, now - dragRef.current.lastTime);
            const velocity = Math.sqrt(dx * dx + dy * dy) / dt;
            const targetX = clamp(dx / dt, -1, 1);
            const targetY = clamp(dy / dt, -1, 1);
            currentRef.current.x = currentRef.current.x * 0.7 + targetX * 0.3;
            currentRef.current.y = currentRef.current.y * 0.7 + targetY * 0.3;
            const point = getLocalPoint(event);
            pokeAt(point.x, point.y, velocity);
            dragRef.current.lastX = event.clientX;
            dragRef.current.lastY = event.clientY;
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

      <SlapInlineText>Tip: Drag to create a current. Rapid taps make fish dart.</SlapInlineText>
    </SlapApplicationShell>
  );
};

export const aquariumManifest: SlapApplicationManifest = {
  id: "aquarium",
  title: "Aquarium",
  author: "Joel",
  description: "Relaxing fish tank you can feed and poke.",
  icon: "🐟",
  Preview,
  Application: AquariumApp
};
