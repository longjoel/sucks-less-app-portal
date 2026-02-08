import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type Operator = "+" | "-" | "*" | "/";

type HistoryItem = {
  id: string;
  expression: string;
  result: string;
  createdAtIso: string;
};

type CalculatorState = {
  display: string;
  history: HistoryItem[];
};

const CALCULATOR_STATE_PATH = "calculator-state.json";
const MAX_HISTORY_ITEMS = 100;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Calculator</strong>
    <p>4-function handheld style calculator with history.</p>
  </article>
);

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-9)) {
    return value.toExponential(6);
  }

  return value.toString();
};

const applyOperation = (left: number, right: number, operator: Operator): number | null => {
  if (operator === "+") {
    return left + right;
  }

  if (operator === "-") {
    return left - right;
  }

  if (operator === "*") {
    return left * right;
  }

  if (right === 0) {
    return null;
  }

  return left / right;
};

const asOperatorText = (operator: Operator) => {
  if (operator === "*") {
    return "×";
  }

  if (operator === "/") {
    return "÷";
  }

  return operator;
};

const isHistoryItem = (value: unknown): value is HistoryItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.expression === "string" &&
    typeof candidate.result === "string" &&
    typeof candidate.createdAtIso === "string"
  );
};

const CalculatorApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [display, setDisplay] = useState("0");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOperator, setPendingOperator] = useState<Operator | null>(null);
  const [lastOperator, setLastOperator] = useState<Operator | null>(null);
  const [lastOperand, setLastOperand] = useState<number | null>(null);
  const [isWaitingForNextInput, setIsWaitingForNextInput] = useState(true);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(CALCULATOR_STATE_PATH);
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;

        if (typeof parsed !== "object" || parsed === null) {
          return;
        }

        const candidate = parsed as Partial<CalculatorState>;

        if (typeof candidate.display === "string") {
          setDisplay(candidate.display);
        }

        if (Array.isArray(candidate.history)) {
          setHistory(candidate.history.filter(isHistoryItem).slice(0, MAX_HISTORY_ITEMS));
        }
      } catch {
        setDisplay("0");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    const state: CalculatorState = {
      display,
      history
    };

    void ctx.vfs.writeText(CALCULATOR_STATE_PATH, JSON.stringify(state));
  }, [ctx.vfs, display, history]);

  const pushHistory = (expression: string, result: string) => {
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      expression,
      result,
      createdAtIso: new Date().toISOString()
    };

    setHistory((current) => [item, ...current].slice(0, MAX_HISTORY_ITEMS));
  };

  const resetCalculator = () => {
    setDisplay("0");
    setAccumulator(null);
    setPendingOperator(null);
    setLastOperator(null);
    setLastOperand(null);
    setIsWaitingForNextInput(true);
  };

  const pressDigit = (digit: string) => {
    if (display === "Error") {
      setDisplay(digit);
      setIsWaitingForNextInput(false);
      return;
    }

    if (isWaitingForNextInput) {
      setDisplay(digit);
      setIsWaitingForNextInput(false);
      return;
    }

    setDisplay((current) => (current === "0" ? digit : `${current}${digit}`));
  };

  const pressDecimal = () => {
    if (display === "Error") {
      setDisplay("0.");
      setIsWaitingForNextInput(false);
      return;
    }

    if (isWaitingForNextInput) {
      setDisplay("0.");
      setIsWaitingForNextInput(false);
      return;
    }

    if (!display.includes(".")) {
      setDisplay((current) => `${current}.`);
    }
  };

  const execute = (left: number, right: number, operator: Operator, shouldLogHistory: boolean) => {
    const value = applyOperation(left, right, operator);

    if (value === null) {
      setDisplay("Error");
      setAccumulator(null);
      setPendingOperator(null);
      setLastOperator(null);
      setLastOperand(null);
      setIsWaitingForNextInput(true);
      return;
    }

    const resultText = formatNumber(value);
    setDisplay(resultText);
    setAccumulator(value);
    setIsWaitingForNextInput(true);

    if (shouldLogHistory) {
      pushHistory(`${formatNumber(left)} ${asOperatorText(operator)} ${formatNumber(right)}`, resultText);
    }
  };

  const pressOperator = (operator: Operator) => {
    const inputValue = Number(display);
    if (display === "Error" || Number.isNaN(inputValue)) {
      return;
    }

    if (pendingOperator !== null && accumulator !== null && !isWaitingForNextInput) {
      const value = applyOperation(accumulator, inputValue, pendingOperator);
      if (value === null) {
        setDisplay("Error");
        setAccumulator(null);
        setPendingOperator(null);
        setLastOperator(null);
        setLastOperand(null);
        setIsWaitingForNextInput(true);
        return;
      }

      const resultText = formatNumber(value);
      setDisplay(resultText);
      setAccumulator(value);
      setLastOperator(null);
      setLastOperand(null);
      setPendingOperator(operator);
      setIsWaitingForNextInput(true);
      return;
    }

    const nextAccumulator = accumulator === null || isWaitingForNextInput ? inputValue : accumulator;
    setAccumulator(nextAccumulator);
    setPendingOperator(operator);
    setIsWaitingForNextInput(true);
  };

  const pressEquals = () => {
    if (display === "Error") {
      return;
    }

    const inputValue = Number(display);
    if (Number.isNaN(inputValue)) {
      return;
    }

    if (pendingOperator !== null && accumulator !== null) {
      const rightOperand = isWaitingForNextInput ? accumulator : inputValue;
      execute(accumulator, rightOperand, pendingOperator, true);
      setLastOperator(pendingOperator);
      setLastOperand(rightOperand);
      setPendingOperator(null);
      return;
    }

    if (lastOperator !== null && lastOperand !== null) {
      execute(inputValue, lastOperand, lastOperator, true);
    }
  };

  const pressToggleSign = () => {
    if (display === "Error") {
      return;
    }

    const inputValue = Number(display);
    if (Number.isNaN(inputValue)) {
      return;
    }

    setDisplay(formatNumber(inputValue * -1));
    setIsWaitingForNextInput(false);
  };

  const pressPercent = () => {
    if (display === "Error") {
      return;
    }

    const inputValue = Number(display);
    if (Number.isNaN(inputValue)) {
      return;
    }

    setDisplay(formatNumber(inputValue / 100));
    setIsWaitingForNextInput(false);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const operationHint = useMemo(() => {
    if (pendingOperator === null || accumulator === null) {
      return "";
    }

    return `${formatNumber(accumulator)} ${asOperatorText(pendingOperator)}`;
  }, [pendingOperator, accumulator]);

  return (
    <SlapApplicationShell title="Calculator">
      <SlapApplicationTitle title="4-Function Calculator" />

      <section className="calc-screen" aria-label="Calculator display">
        <SlapInlineText>{operationHint || "Ready"}</SlapInlineText>
        <p className="calc-display">{display}</p>
      </section>

      <section className="calc-grid" aria-label="Calculator keypad">
        <button type="button" className="calc-key calc-key-meta" onClick={resetCalculator}>
          C
        </button>
        <button type="button" className="calc-key calc-key-meta" onClick={pressToggleSign}>
          +/-
        </button>
        <button type="button" className="calc-key calc-key-meta" onClick={pressPercent}>
          %
        </button>
        <button type="button" className="calc-key calc-key-op" onClick={() => pressOperator("/")}>
          ÷
        </button>

        <button type="button" className="calc-key" onClick={() => pressDigit("7")}>
          7
        </button>
        <button type="button" className="calc-key" onClick={() => pressDigit("8")}>
          8
        </button>
        <button type="button" className="calc-key" onClick={() => pressDigit("9")}>
          9
        </button>
        <button type="button" className="calc-key calc-key-op" onClick={() => pressOperator("*")}>
          ×
        </button>

        <button type="button" className="calc-key" onClick={() => pressDigit("4")}>
          4
        </button>
        <button type="button" className="calc-key" onClick={() => pressDigit("5")}>
          5
        </button>
        <button type="button" className="calc-key" onClick={() => pressDigit("6")}>
          6
        </button>
        <button type="button" className="calc-key calc-key-op" onClick={() => pressOperator("-")}>
          -
        </button>

        <button type="button" className="calc-key" onClick={() => pressDigit("1")}>
          1
        </button>
        <button type="button" className="calc-key" onClick={() => pressDigit("2")}>
          2
        </button>
        <button type="button" className="calc-key" onClick={() => pressDigit("3")}>
          3
        </button>
        <button type="button" className="calc-key calc-key-op" onClick={() => pressOperator("+")}>
          +
        </button>

        <button type="button" className="calc-key calc-key-wide" onClick={() => pressDigit("0")}>
          0
        </button>
        <button type="button" className="calc-key" onClick={pressDecimal}>
          .
        </button>
        <button type="button" className="calc-key calc-key-op" onClick={pressEquals}>
          =
        </button>
      </section>

      <section className="calc-history" aria-label="Calculation history">
        <div className="calc-history-header">
          <SlapApplicationTitle title="History" />
          <button type="button" className="calc-clear-history" onClick={clearHistory}>
            Clear
          </button>
        </div>

        {history.length === 0 ? <SlapInlineText>No calculations yet.</SlapInlineText> : null}

        {history.map((item) => (
          <article key={item.id} className="calc-history-item">
            <strong>{item.expression}</strong>
            <span>= {item.result}</span>
          </article>
        ))}
      </section>
    </SlapApplicationShell>
  );
};

export const calculatorManifest: SlapApplicationManifest = {
  id: "calculator",
  title: "Calculator",
  author: "Joel",
  description: "4-function calculator with persistent history.",
  icon: "🧮",
  Preview,
  Application: CalculatorApp
};
