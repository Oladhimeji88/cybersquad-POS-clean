import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBlocker } from "./business";
import { ageLabel, type WorkItem } from "./workItems";
import { Choice, CodeTag, EmptyState, errorMessage, Pill, SectionHeader } from "./shared";

function WorkRow({ item, open, refresh }: { item: WorkItem; open: () => void; refresh: () => void }) {
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(item.owner); const [action, setAction] = useState(item.nextAction); const [due, setDue] = useState(item.dueAt?.slice(0, 10) ?? "");
  const overdue = Boolean(item.dueAt && Date.parse(item.dueAt) < Date.now());
  return <article className={"rounded-lg border p-4 space-y-4 " + (item.exception ? "border-error/40 bg-error/5" : "border-border bg-card")}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><CodeTag code={item.code} /><span className="text-xs text-muted-foreground">{item.workflow}</span></div>
        <Button variant="link" className="h-auto p-0 text-left font-medium" onClick={open}>{item.title}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={item.exception ? "bad" : "info"}>{item.state}</Pill>
        <Pill tone="neutral">{ageLabel(item.since)} open</Pill>
        {item.reason && <Pill tone="bad">{item.reason}</Pill>}
      </div>
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Owner</dt><dd className="font-medium">{item.owner}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Waiting on</dt><dd className="font-medium">{item.waitingOn}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Next action{item.dueAt ? " · due " + new Date(item.dueAt).toLocaleDateString() : ""}</dt>
        <dd className={"font-medium " + (overdue ? "text-error" : "")}>{item.nextAction}{overdue ? " (overdue)" : ""}</dd></div>
    </dl>
    <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}><Pencil className="h-4 w-4" aria-hidden="true" />Reassign or set next action</Button>
    {editing && <form className="grid gap-4 sm:grid-cols-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true);
      try { await saveBlocker(item.id, owner, action, due); setEditing(false); refresh(); toast.success("Action saved."); }
      catch (error) { toast.error(errorMessage(error, "Could not save action.")); } finally { setBusy(false); }
    }}>
      <Input aria-label="Owner" required value={owner} onChange={(event) => setOwner(event.target.value)} />
      <Input aria-label="Next action" required value={action} onChange={(event) => setAction(event.target.value)} />
      <Input aria-label="Action due date" type="date" value={due} onChange={(event) => setDue(event.target.value)} />
      <Button disabled={busy} type="submit">Save</Button>
    </form>}
  </article>;
}

// One queue across every department (OPS-05). Staff see their own work; managers see everything.
export default function WorkQueue({ items, management, title, description, onOpen, refresh }: {
  items: WorkItem[]; management: boolean; title: string; description: string; onOpen: (item: WorkItem) => void; refresh: () => void;
}) {
  const [filter, setFilter] = useState("all"); const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const states = [...new Set(items.map((item) => item.state))].sort();
  const exceptions = items.filter((item) => item.exception).length;
  const visible = items.filter((item) => (filter === "all" || item.state === filter) && (!exceptionsOnly || item.exception))
    .sort((a, b) => Number(b.exception) - Number(a.exception) || Date.parse(a.since) - Date.parse(b.since));
  return <section className="space-y-4">
    <SectionHeader title={title} description={description} action={
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={exceptionsOnly ? "default" : "outline"} aria-pressed={exceptionsOnly} onClick={() => setExceptionsOnly(!exceptionsOnly)}>Exceptions ({exceptions})</Button>
        <div className="w-56"><Choice label="Filter by state" value={filter} onChange={setFilter} options={[["all", "All open work (" + items.length + ")"], ...states.map((state): [string, string] => [state, state])]} /></div>
      </div>} />
    <div className="space-y-4 motion-stagger">{visible.map((item) => <WorkRow key={item.id} item={item} open={() => onOpen(item)} refresh={refresh} />)}</div>
    {!visible.length && <EmptyState icon={CheckCircle2}>{management ? "No open work matches this view." : "Nothing is waiting on you right now."}</EmptyState>}
  </section>;
}

// What a role is accountable for. Owners are either a person's name or a team label.
export function ownsItem(item: WorkItem, roles: string[], userName: string) {
  if (roles.includes("admin") || item.owner === userName) return true;
  const teams: Record<string, string[]> = { front_desk: ["Front desk"], sales: ["Sales", "Front desk"], inventory_manager: ["Inventory", "Logistics"], qa: ["QA desk"], engineer: ["Technical"] };
  return roles.some((role) => teams[role]?.includes(item.owner));
}
