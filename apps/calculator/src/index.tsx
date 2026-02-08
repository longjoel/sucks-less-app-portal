import { useEffect, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import {
  SlapActionButton,
  SlapApplicationShell,
  SlapApplicationTitle,
  SlapInlineText,
  SlapTextInput
} from "@slap/ui";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Calculator</strong>
    <p>Two-number math with local save.</p>
  </article>
);

const CalculatorApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [left, setLeft] = useState("0");
  const [right, setRight] = useState("0");
  const [result, setResult] = useState<string>("0");

  useEffect(() => {
    void (async () => {
      const saved = await ctx.vfs.readText("last-result.txt");
      if (saved !== null) {
        setResult(saved);
      }
    })();
  }, [ctx.vfs]);

  const calculate = async (operation: "+" | "-" | "*" | "/") => {
    const a = Number(left);
    const b = Number(right);

    if (Number.isNaN(a) || Number.isNaN(b)) {
      setResult("Invalid number input");
      return;
    }

    if (operation === "/" && b === 0) {
      setResult("Cannot divide by zero");
      return;
    }

    const value =
      operation === "+"
        ? a + b
        : operation === "-"
          ? a - b
          : operation === "*"
            ? a * b
            : a / b;

    const next = String(value);
    setResult(next);
    await ctx.vfs.writeText("last-result.txt", next);
  };

  return (
    <SlapApplicationShell title="Calculator">
      <SlapApplicationTitle title="Quick Math" />
      <SlapTextInput label="Left" value={left} onChange={setLeft} type="number" />
      <SlapTextInput label="Right" value={right} onChange={setRight} type="number" />
      <div className="slap-button-row">
        <SlapActionButton title="+" onClick={() => void calculate("+")} />
        <SlapActionButton title="-" onClick={() => void calculate("-")} />
        <SlapActionButton title="*" onClick={() => void calculate("*")} />
        <SlapActionButton title="/" onClick={() => void calculate("/")} />
      </div>
      <SlapInlineText>Result: {result}</SlapInlineText>
    </SlapApplicationShell>
  );
};

export const calculatorManifest: SlapApplicationManifest = {
  id: "calculator",
  title: "Calculator",
  author: "Joel",
  description: "A tiny offline-first calculator.",
  icon: "🧮",
  Preview,
  Application: CalculatorApp
};
