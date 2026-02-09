import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type Feedback = {
  exact: number;
  colorOnly: number;
};

type GuessRecord = {
  id: string;
  colors: number[];
  result: Feedback;
  createdAtIso: string;
};

type GameStatus = "playing" | "won" | "lost";

type GameState = {
  secret: number[];
  guesses: GuessRecord[];
  currentGuess: Array<number | null>;
  status: GameStatus;
  maxGuesses: number;
  startedAtIso: string;
  updatedAtIso: string;
};

type ColorDef = {
  id: number;
  name: string;
  hex: string;
};

const STORAGE_PATH = "mastermind-state.json";
const PEG_COUNT = 4;
const MAX_GUESSES = 10;

const COLORS: ColorDef[] = [
  { id: 0, name: "Red", hex: "#d64550" },
  { id: 1, name: "Orange", hex: "#f08a24" },
  { id: 2, name: "Yellow", hex: "#f2cc8f" },
  { id: 3, name: "Green", hex: "#4c9a2a" },
  { id: 4, name: "Blue", hex: "#2c7fb8" },
  { id: 5, name: "Purple", hex: "#7b4f9f" }
];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Mastermind</strong>
    <p>Crack the code with feedback pegs in 10 guesses.</p>
  </article>
);

const isValidColorId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < COLORS.length;

const createSecret = () =>
  Array.from({ length: PEG_COUNT }, () => Math.floor(Math.random() * COLORS.length));

const createNewGame = (): GameState => {
  const now = new Date().toISOString();
  return {
    secret: createSecret(),
    guesses: [],
    currentGuess: Array.from({ length: PEG_COUNT }, () => null),
    status: "playing",
    maxGuesses: MAX_GUESSES,
    startedAtIso: now,
    updatedAtIso: now
  };
};

const scoreGuess = (secret: number[], guess: number[]): Feedback => {
  let exact = 0;
  const secretCounts = new Array(COLORS.length).fill(0);
  const guessCounts = new Array(COLORS.length).fill(0);

  for (let index = 0; index < PEG_COUNT; index += 1) {
    if (secret[index] === guess[index]) {
      exact += 1;
    } else {
      secretCounts[secret[index]] += 1;
      guessCounts[guess[index]] += 1;
    }
  }

  let colorOnly = 0;
  for (let color = 0; color < COLORS.length; color += 1) {
    colorOnly += Math.min(secretCounts[color], guessCounts[color]);
  }

  return { exact, colorOnly };
};

const isGuessRecord = (value: unknown): value is GuessRecord => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.colors) &&
    candidate.colors.length === PEG_COUNT &&
    candidate.colors.every(isValidColorId) &&
    typeof candidate.createdAtIso === "string" &&
    typeof candidate.result === "object" &&
    candidate.result !== null &&
    typeof (candidate.result as Feedback).exact === "number" &&
    typeof (candidate.result as Feedback).colorOnly === "number"
  );
};

const parseStoredGame = (raw: string): GameState | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (!Array.isArray(parsed.secret) || parsed.secret.length !== PEG_COUNT || parsed.secret.some((value) => !isValidColorId(value))) {
      return null;
    }

    if (!Array.isArray(parsed.currentGuess) || parsed.currentGuess.length !== PEG_COUNT) {
      return null;
    }

    const currentGuess = parsed.currentGuess.map((value) => (value === null ? null : isValidColorId(value) ? value : null));
    const guesses = Array.isArray(parsed.guesses) ? parsed.guesses.filter(isGuessRecord) : [];
    const status: GameStatus = parsed.status === "won" || parsed.status === "lost" ? parsed.status : "playing";
    const maxGuesses = typeof parsed.maxGuesses === "number" && parsed.maxGuesses > 0 ? parsed.maxGuesses : MAX_GUESSES;
    const startedAtIso = typeof parsed.startedAtIso === "string" ? parsed.startedAtIso : new Date().toISOString();
    const updatedAtIso = typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : startedAtIso;

    return {
      secret: parsed.secret as number[],
      guesses,
      currentGuess,
      status,
      maxGuesses,
      startedAtIso,
      updatedAtIso
    };
  } catch {
    return null;
  }
};

const feedbackDots = (feedback?: Feedback) => {
  const dots: Array<"exact" | "partial" | "empty"> = [];
  if (!feedback) {
    return Array.from({ length: PEG_COUNT }, () => "empty") as Array<"exact" | "partial" | "empty">;
  }

  dots.push(...Array.from({ length: feedback.exact }, () => "exact"));
  dots.push(...Array.from({ length: feedback.colorOnly }, () => "partial"));
  while (dots.length < PEG_COUNT) dots.push("empty");
  return dots;
};

const MastermindApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [game, setGame] = useState<GameState>(createNewGame);
  const [message, setMessage] = useState("Pick a color, then tap slots to build your guess.");
  const [selectedColor, setSelectedColor] = useState<number | null>(COLORS[0].id);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      const parsed = parseStoredGame(raw);
      if (parsed) {
        setGame(parsed);
        return;
      }
      setMessage("Saved game was invalid. Starting fresh.");
      setGame(createNewGame());
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(game, null, 2));
  }, [ctx.vfs, game]);

  const attemptsLeft = game.maxGuesses - game.guesses.length;
  const isGuessComplete = game.currentGuess.every((value) => value !== null);

  const setSlot = (index: number) => {
    if (game.status !== "playing") return;

    setGame((current) => {
      if (current.status !== "playing") return current;
      const nextGuess = [...current.currentGuess];
      nextGuess[index] = selectedColor;
      return { ...current, currentGuess: nextGuess, updatedAtIso: new Date().toISOString() };
    });
  };

  const clearRow = () => {
    if (game.status !== "playing") return;
    setGame((current) => ({
      ...current,
      currentGuess: Array.from({ length: PEG_COUNT }, () => null),
      updatedAtIso: new Date().toISOString()
    }));
  };

  const submitGuess = () => {
    if (game.status !== "playing") return;
    if (!isGuessComplete) {
      setMessage("Fill all 4 pegs before submitting.");
      return;
    }

    const colors = game.currentGuess.map((value) => value ?? 0) as number[];
    const result = scoreGuess(game.secret, colors);
    const nextGuess: GuessRecord = {
      id: crypto.randomUUID(),
      colors,
      result,
      createdAtIso: new Date().toISOString()
    };

    const nextGuesses = [...game.guesses, nextGuess];
    let status: GameStatus = "playing";
    let nextMessage = `Guesses left: ${game.maxGuesses - nextGuesses.length}.`;

    if (result.exact === PEG_COUNT) {
      status = "won";
      nextMessage = "You cracked the code!";
    } else if (nextGuesses.length >= game.maxGuesses) {
      status = "lost";
      nextMessage = "No more guesses. The code is revealed below.";
    }

    setGame({
      ...game,
      guesses: nextGuesses,
      currentGuess: Array.from({ length: PEG_COUNT }, () => null),
      status,
      updatedAtIso: new Date().toISOString()
    });
    setMessage(nextMessage);
  };

  const newGame = () => {
    setGame(createNewGame());
    setMessage("New game started. Pick a color and guess the code.");
  };

  const secretRevealed = game.status !== "playing";

  const rows = useMemo(() => {
    const history = game.guesses.map((guess) => ({
      key: guess.id,
      colors: guess.colors.map((value) => value as number | null),
      feedback: guess.result,
      isActive: false
    }));

    if (game.status === "playing") {
      history.push({
        key: "current",
        colors: game.currentGuess,
        feedback: undefined,
        isActive: true
      });
    }

    return history;
  }, [game]);

  return (
    <SlapApplicationShell title="Mastermind">
      <SlapApplicationTitle title="Mastermind" />
      <SlapInlineText>Crack the 4-peg code in {game.maxGuesses} guesses.</SlapInlineText>
      <SlapInlineText>Exact match = dark peg. Right color, wrong spot = light peg.</SlapInlineText>
      <SlapInlineText>{message}</SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title="New Game" onClick={newGame} />
        <SlapActionButton title="Clear Row" onClick={clearRow} disabled={game.status !== "playing"} />
        <SlapActionButton title="Submit Guess" onClick={submitGuess} disabled={game.status !== "playing" || !isGuessComplete} />
      </div>

      <SlapInlineText>
        Guess {Math.min(game.guesses.length + 1, game.maxGuesses)} of {game.maxGuesses} · Attempts left: {attemptsLeft}
      </SlapInlineText>

      <div className="mastermind-board">
        {rows.map((row) => (
          <div key={row.key} className="mastermind-row">
            {row.colors.map((colorId, index) => {
              const color = typeof colorId === "number" ? COLORS[colorId] : null;
              const label = color ? color.name : "Empty";
              return (
                <button
                  key={`${row.key}-${index}`}
                  type="button"
                  className={`mastermind-slot${color ? "" : " is-empty"}${row.isActive ? " is-active" : ""}`}
                  style={color ? { background: color.hex } : undefined}
                  onClick={row.isActive ? () => setSlot(index) : undefined}
                  disabled={!row.isActive}
                  aria-label={`Slot ${index + 1}: ${label}`}
                />
              );
            })}
            <div className="mastermind-feedback" aria-hidden="true">
              {feedbackDots(row.feedback).map((dot, dotIndex) => (
                <span key={`${row.key}-dot-${dotIndex}`} className={`mastermind-feedback-dot ${dot}`} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <SlapApplicationTitle title="Palette" />
      <div className="mastermind-palette">
        {COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            className={`mastermind-color-button${selectedColor === color.id ? " is-selected" : ""}`}
            onClick={() => setSelectedColor(color.id)}
            aria-pressed={selectedColor === color.id}
          >
            <span className="mastermind-color-swatch" style={{ background: color.hex }} />
            <span>{color.name}</span>
          </button>
        ))}
        <button
          type="button"
          className={`mastermind-color-button mastermind-eraser${selectedColor === null ? " is-selected" : ""}`}
          onClick={() => setSelectedColor(null)}
          aria-pressed={selectedColor === null}
        >
          <span className="mastermind-color-swatch mastermind-eraser-swatch" />
          <span>Erase</span>
        </button>
      </div>

      <SlapApplicationTitle title={secretRevealed ? "Secret Code" : "Secret Code (hidden)"} />
      <div className="mastermind-secret">
        {game.secret.map((colorId, index) => {
          const color = COLORS[colorId];
          return (
            <div
              key={`secret-${index}`}
              className={`mastermind-slot${secretRevealed ? "" : " is-hidden"}`}
              style={secretRevealed ? { background: color.hex } : undefined}
              aria-hidden={!secretRevealed}
            />
          );
        })}
      </div>
    </SlapApplicationShell>
  );
};

export const mastermindManifest: SlapApplicationManifest = {
  id: "mastermind",
  title: "Mastermind",
  author: "Joel",
  description: "Crack the secret color code with feedback pegs.",
  icon: "🧩",
  Preview,
  Application: MastermindApp
};
