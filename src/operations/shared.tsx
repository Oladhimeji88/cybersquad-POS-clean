import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OpsData } from "./data";
import { can, type Capability } from "./access";
import type { LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type Tone = "neutral" | "info" | "good" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground", info: "bg-primary/10 text-primary",
  good: "bg-success/10 text-success", warn: "bg-warning/15 text-warning", bad: "bg-error/10 text-error",
};
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={"inline-flex items-center rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap " + TONES[tone]}>{children}</span>;
}
// Workflow code from the SOP library (e.g. SAL-04) so staff, Academy and reports share one name.
export function CodeTag({ code }: { code: string }) {
  return <span className="rounded-md border border-border px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">{code}</span>;
}
export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
    <Icon className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />{children}</div>;
}
export function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="space-y-2"><Label className="text-sm">{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
    {items.map(([label, value]) => <div key={label} className="space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
  </dl>;
}
export function Choice({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (value: string) => void; options: [string, string][]; placeholder?: string; disabled?: boolean;
}) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder ?? label} /></SelectTrigger>
    <SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent>
  </Select>;
}
export function Timeline({ events }: { events: { at: string; by: string; action: string; detail: string }[] }) {
  return <ol className="space-y-2 border-l-2 border-border pl-4 text-sm">
    {[...events].reverse().map((event, index) => <li key={index}>
      <span className="text-xs text-muted-foreground">{new Date(event.at).toLocaleString()} · {event.by}</span>
      <span className="block">{event.detail}</span></li>)}
  </ol>;
}
export const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

// ---- Shared by the operations boards ----

export interface OpsContext { roles: string[]; userName: string; data: OpsData; reload: () => Promise<void>; can: (...capabilities: Capability[]) => boolean; }
export const makeContext = (roles: string[], userName: string, data: OpsData, reload: () => Promise<void>): OpsContext => ({ roles, userName, data, reload, can: (...capabilities) => can(roles, ...capabilities) });

// Runs a save, refreshes the shared data, and tells the person what happened in plain words.
export function useRun(reload: () => Promise<unknown> | void) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { const result = await action(); await reload(); toast.success(success); return result; }
    catch (error) { toast.error(errorMessage(error, "Could not save.")); return undefined; } finally { setBusy(false); }
  };
  return { busy, run };
}
export function Panel({ children }: { children: ReactNode }) {
  return <article className="space-y-4 rounded-lg border border-border bg-card p-4">{children}</article>;
}
export function Step({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-4 rounded-md bg-secondary/40 p-4"><h4 className="text-sm font-semibold">{title}</h4>{children}</div>;
}
export function FormDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent style={{ maxWidth: "36rem", maxHeight: "85vh", overflowY: "auto" }}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
export function Stat({ label, value, note, tone = "neutral" }: { label: string; value: ReactNode; note?: string; tone?: Tone }) {
  return <div className="space-y-1 rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p>
    <p className={"text-xl font-semibold tabular-nums " + (tone === "bad" ? "text-error" : tone === "warn" ? "text-warning" : "")}>{value}</p>{note && <p className="text-xs text-muted-foreground">{note}</p>}</div>;
}
export function Tabbed({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (value: string) => void }) {
  return <div className="flex flex-wrap gap-2" role="tablist">{tabs.map(([key, label]) =>
    <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
      className={"press rounded-md px-4 py-2 text-sm font-medium " + (value === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{label}</button>)}</div>;
}
export const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value || 0);
export const num = (text: string) => (text.trim() === "" ? NaN : Number(text));

// A button that asks for a short reason in a proper dialog before doing something that needs one on record.
export function ReasonButton({ label, title, description, placeholder = "Reason", submitLabel, onSubmit, variant = "outline", size = "sm", disabled }: {
  label: string; title: string; description?: string; placeholder?: string; submitLabel?: string; onSubmit: (reason: string) => Promise<unknown> | void;
  variant?: "default" | "outline" | "ghost"; size?: "sm" | "default"; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  return <>
    <Button type="button" size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
    <FormDialog open={open} onOpenChange={setOpen} title={title} description={description ?? "This is saved on the record."}>
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!reason.trim()) return; setBusy(true);
        try { await onSubmit(reason.trim()); setOpen(false); setReason(""); } finally { setBusy(false); } }}>
        <Textarea autoFocus required rows={3} aria-label={placeholder} placeholder={placeholder} value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !reason.trim()}>{submitLabel ?? label}</Button></div>
      </form></FormDialog></>;
}
