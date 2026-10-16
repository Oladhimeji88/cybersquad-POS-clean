import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildAllWorkItems } from "./data";
import { buildEod, buildReport, expectedResults, lostSales } from "./reports";
import { periodBounds } from "./business";
import { submitEod } from "./routines";
import { Choice, Facts, money, Panel, Pill, SectionHeader, Stat, Tabbed, useRun, type OpsContext } from "./shared";

const PERIODS: [string, string][] = [["today", "Today"], ["week", "This week"], ["previous_week", "Previous week"], ["30", "Last 30 days"], ["90", "Last 90 days"]];
const fmt = (value: string | number) => (typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value));
const looksMoney = (label: string) => /revenue|returns|net sales|average transaction|collections|receivable|margin|bills|value|given|outstanding \(value\)|credit/i.test(label);

export default function ReportsBoard({ ctx }: { ctx: OpsContext }) {
  const [period, setPeriod] = useState("week"); const [tab, setTab] = useState("management"); const [from, to] = periodBounds(period);
  const sections = buildReport(ctx.data, from, to); const results = expectedResults(ctx.data, from, to); const lost = lostSales(ctx.data, from, to);
  const items = buildAllWorkItems(ctx.data); const exceptions = items.filter((item) => item.exception);
  return <section className="space-y-6">
    <SectionHeader title="Reports" description="Everything here is generated from the workflow records. Nothing is typed in twice." action={<div className="flex flex-wrap items-center gap-2"><div className="w-44"><Choice label="Period" value={period} onChange={setPeriod} options={PERIODS} /></div>
      <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />Print</Button></div>} />
    <div className="grid gap-4 sm:grid-cols-4"><Stat label="Open work" value={items.length} /><Stat label="Open exceptions" value={exceptions.length} tone={exceptions.length ? "bad" : "neutral"} /><Stat label="Overdue manager actions" value={ctx.data.actions.filter((a) => a.status === "open" && Date.parse(a.dueDate + "T23:59:59") < Date.now()).length} /><Stat label="Lost sales" value={lost.reduce((s, e) => s + e.count, 0)} /></div>
    <Tabbed value={tab} onChange={setTab} tabs={[["management", "Management review"], ["results", "Expected results"], ["lost", "Lost sales"], ["eod", "End of day"]]} />
    {tab === "management" && <div className="grid gap-4 lg:grid-cols-2">{sections.map((section) => <Panel key={section.title}><h3 className="font-semibold">{section.title}</h3>
      <dl className="divide-y divide-border">{section.rows.map(([label, value, note]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt>
        <dd className="text-right"><span className="font-medium tabular-nums">{typeof value === "number" && looksMoney(label) ? money(value) : fmt(value)}</span>{note && <span className="block text-xs text-muted-foreground">{note}</span>}</dd></div>)}</dl></Panel>)}</div>}
    {tab === "results" && <div className="space-y-4"><p className="text-sm text-muted-foreground">Did workflows reach the result they exist for, in time and with the controls intact, not just move through their steps.</p>
      {results.map((row) => <Panel key={row.family}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{row.family}</h3><Pill tone={row.finished && row.achieved === row.finished ? "good" : "warn"}>{row.finished ? Math.round(row.achieved / row.finished * 100) + "% achieved" : "Nothing finished in this period"}</Pill></div>
        <Facts items={[["Finished", row.finished], ["Reached the intended result", row.achieved], ["On time", row.onTime === undefined ? "Not measured" : row.onTime], ["Control checked", row.control]]} /></Panel>)}</div>}
    {tab === "lost" && <Panel><h3 className="font-semibold">Why sales were lost</h3>{lost.length ? <dl className="divide-y divide-border">{lost.map((row) => <div key={row.reason} className="flex justify-between py-2 text-sm"><dt>{row.reason}</dt><dd className="font-medium tabular-nums">{row.count}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">No lost sales in this period.</p>}
      <p className="text-xs text-muted-foreground">Includes sourcing requests, follow-ups, cancelled digital orders, abandoned interest and declined quotes.</p></Panel>}
    {tab === "eod" && <Eod ctx={ctx} />}
  </section>;
}

function Eod({ ctx }: { ctx: OpsContext }) {
  const date = new Date().toISOString().slice(0, 10); const { busy, run } = useRun(ctx.reload); const [narrative, setNarrative] = useState(""); const day = ctx.data.days.find((entry) => entry.date === date);
  const snapshot = day?.eod?.snapshot ?? buildEod(ctx.data, date, buildAllWorkItems(ctx.data));
  return <Panel><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">End-of-day report · {date}</h3><Pill tone={day?.eod ? "good" : "warn"}>{day?.eod ? "Submitted by " + day.eod.by : "Not submitted"}</Pill></div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{Object.entries(snapshot.figures).map(([label, value]) => <div key={label} className="space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{typeof value === "number" && /revenue|refunds/i.test(label) ? money(value) : value}</dd></div>)}</dl>
    {day?.eod ? <p className="text-sm text-muted-foreground">{day.eod.narrative || "No narrative added."}</p> : <>
      <p className="text-xs text-muted-foreground">The figures above come from today's workflows. Add only what the system cannot know, such as a power cut or a staff issue.</p>
      <Textarea aria-label="Narrative" rows={3} placeholder="Anything material that the numbers do not show (optional)" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
      <Button disabled={busy} onClick={() => void run(() => submitEod(ctx.userName, date, snapshot, narrative), "End-of-day report submitted.")}>Submit report</Button></>}</Panel>;
}
