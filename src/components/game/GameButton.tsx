import type { ButtonHTMLAttributes } from "react";

export function GameButton({ className = "", type = "button", variant = "pixel", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "pixel" | "plain" }) {
  return <button type={type} className={`${variant === "pixel" ? "pixel-btn" : "game-tool"} disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />;
}