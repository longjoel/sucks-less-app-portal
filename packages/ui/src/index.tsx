import type { PropsWithChildren } from "react";

export const SlapApplicationShell = ({
  children
}: PropsWithChildren<{ title?: string }>) => (
  <section className="slap-shell">
    {children}
  </section>
);

export const SlapApplicationTitle = ({ title }: { title: string }) => (
  <h3 className="slap-title">{title}</h3>
);

export const SlapActionButton = ({
  title,
  onClick,
  disabled
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) => (
  <button type="button" className="slap-button" onClick={onClick} disabled={disabled}>
    {title}
  </button>
);

export const SlapTextInput = ({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "password";
}) => (
  <label className="slap-input-wrap">
    <span>{label}</span>
    <input
      className="slap-input"
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

export const SlapInlineText = ({ children }: PropsWithChildren) => (
  <p className="slap-inline-text">{children}</p>
);

export const SlapGamepad = ({
  onUp,
  onDown,
  onLeft,
  onRight,
  onA,
  onB,
  disabled = false,
  dpadDisabled = false,
  aDisabled = false,
  bDisabled = false,
  aLabel = "A",
  bLabel = "B",
  aTitle,
  bTitle
}: {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onA?: () => void;
  onB?: () => void;
  disabled?: boolean;
  dpadDisabled?: boolean;
  aDisabled?: boolean;
  bDisabled?: boolean;
  aLabel?: string;
  bLabel?: string;
  aTitle?: string;
  bTitle?: string;
}) => {
  const isDpadDisabled = disabled || dpadDisabled;
  const isADisabled = disabled || aDisabled || !onA;
  const isBDisabled = disabled || bDisabled || !onB;

  return (
    <div className="slap-gamepad" role="group" aria-label="Game controls">
      <div className="slap-gamepad-dpad" role="group" aria-label="Directional pad">
        <span className="slap-gamepad-center" aria-hidden="true" />
        <button
          type="button"
          className="slap-gamepad-button slap-gamepad-button-dpad"
          style={{ gridArea: "up" }}
          onClick={onUp}
          disabled={isDpadDisabled || !onUp}
          aria-label="Move up"
        >
          ⬆️
        </button>
        <button
          type="button"
          className="slap-gamepad-button slap-gamepad-button-dpad"
          style={{ gridArea: "left" }}
          onClick={onLeft}
          disabled={isDpadDisabled || !onLeft}
          aria-label="Move left"
        >
          ⬅️
        </button>
        <button
          type="button"
          className="slap-gamepad-button slap-gamepad-button-dpad"
          style={{ gridArea: "down" }}
          onClick={onDown}
          disabled={isDpadDisabled || !onDown}
          aria-label="Move down"
        >
          ⬇️
        </button>
        <button
          type="button"
          className="slap-gamepad-button slap-gamepad-button-dpad"
          style={{ gridArea: "right" }}
          onClick={onRight}
          disabled={isDpadDisabled || !onRight}
          aria-label="Move right"
        >
          ➡️
        </button>
      </div>
      <div className="slap-gamepad-ab" role="group" aria-label="Action buttons">
        <button
          type="button"
          className="slap-gamepad-button slap-gamepad-button-ab"
          onClick={onA}
          disabled={isADisabled}
          aria-label={aTitle ?? aLabel}
          title={aTitle}
        >
          {aLabel}
        </button>
        <button
          type="button"
          className="slap-gamepad-button slap-gamepad-button-ab"
          onClick={onB}
          disabled={isBDisabled}
          aria-label={bTitle ?? bLabel}
          title={bTitle}
        >
          {bLabel}
        </button>
      </div>
    </div>
  );
};
