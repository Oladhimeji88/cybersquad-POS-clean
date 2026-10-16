import { Card, CardContent } from "./card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

// Shared metric-card look used across the admin dashboard (Dashboard
// Overview, Repair Performance, SLA Management, Store Details) so every stat
// card shares the same visual language instead of each section inventing its
// own.
export function StatCard({ title, value, change, note, icon: Icon, color = "text-primary", bgColor = "bg-accent", onClick }) {
  const isPositive = typeof change === "string" && change.trim().startsWith("+");
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  const card = (
    <Card
      className={`h-full rounded-xl border-border/60 shadow-sm transition-colors duration-150 ${
        onClick ? "hover:border-primary/30 hover:bg-secondary/30" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 min-h-8 text-xs font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">
              {value ?? "—"}
            </p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bgColor}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>

        {(change || note) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {change && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                  isPositive ? "bg-success/10 text-success" : "bg-error/10 text-error"
                }`}
              >
                <TrendIcon className="h-3 w-3" />
                {change}
              </span>
            )}
            {note && <span className="text-xs text-muted-foreground">{note}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!onClick) return card;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </button>
  );
}
