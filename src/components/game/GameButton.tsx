import type { ButtonHTMLAttributes } from "react";

export function GameButton({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`pixel-btn disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />;
}