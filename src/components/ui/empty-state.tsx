import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Единый вид пустых списков и ошибок загрузки. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && <div className="mb-1 text-faint [&>svg]:size-8">{icon}</div>}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Крутилка для инлайновых загрузок. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin text-muted", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
