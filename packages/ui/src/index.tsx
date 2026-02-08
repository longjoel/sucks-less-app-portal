import type { PropsWithChildren } from "react";

export const SlapApplicationShell = ({
  title,
  children
}: PropsWithChildren<{ title: string }>) => (
  <section className="slap-shell">
    <h2>{title}</h2>
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
  type?: "text" | "number";
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
