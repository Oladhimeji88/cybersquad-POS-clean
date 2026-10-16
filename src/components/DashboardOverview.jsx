import React, { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { StatCard } from "./ui/stat-card";
import {
	AlertCircle,
	TrendingUp,
	Loader2,
	ShoppingCart,
	Store,
	Globe,
	ArrowRight,
	Wallet,
	Activity,
	BarChart3,
	PieChart as PieChartIcon,
} from "lucide-react";
import {
	BarChart,
	Bar,
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { getSalesSummary } from "../pos/lib/store";
import { fetchWebsiteSalesSummary } from "../lib/websiteSales";
import { formatCurrency } from "../lib/currency";
import { RepairPerformance } from "./RepairPerformance";

const FILTER_LABELS = {
	"1d": "Last 24 hours",
	"3d": "Last 3 days",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
	all: "All time",
};

// Same design-system chart tokens as the bar/area charts above, so every
// color on this page traces back to one palette instead of one-off hex.
const JOB_STATUS_COLORS = {
	active: "var(--chart-1)",
	completed: "var(--chart-4)",
	cancelled: "var(--destructive)",
};

const formatDelta = (pct) => {
	if (pct === null || pct === undefined) return null;
	return pct >= 0 ? `+${pct}%` : `${pct}%`;
};

const formatDeltaFixed = (pct, decimals = 2) => {
	if (pct === null || pct === undefined) return null;
	const value = Number(pct);
	if (Number.isNaN(value)) return null;
	const fixed = value.toFixed(decimals);
	return value >= 0 ? `+${fixed}%` : `${fixed}%`;
};

const formatDay = (dateStr) => {
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", { weekday: "short" });
};

const formatMonth = (monthStr) => {
	const [year, month] = monthStr.split("-");
	return new Date(year, month - 1).toLocaleDateString("en-US", {
		month: "short",
	});
};

const NairaIcon = ({ className }) => (
	<span className={`${className} font-semibold leading-none`}>₦</span>
);

// This app's theme tokens (src/styles/globals.css) are plain hex values
// (e.g. --border: #e5e7eb), not the bare "H S% L%" triplets the shadcn
// convention expects — so wrapping them in hsl(var(--x)) produces the
// invalid CSS `hsl(#e5e7eb)`, which browsers silently drop (verified: it
// computes to `none`/transparent, not the intended muted color). Every chart
// color below references the tokens directly instead.
const chartTooltipStyle = {
	backgroundColor: "var(--popover)",
	border: "1px solid var(--border)",
	borderRadius: "10px",
	boxShadow: "0 8px 24px -8px rgba(0,0,0,0.14)",
	padding: "8px 12px",
};

const chartAxisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

// Consistent "icon badge + title + description (+ optional link)" header used
// across every section on this page, so they all read as one system.
function SectionHeading({ icon: Icon, title, description, actionLabel, onAction }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex items-center gap-2">
				{Icon && (
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
						<Icon className="h-4 w-4 text-primary" />
					</span>
				)}
				<div>
					<h2 className="text-base font-semibold text-foreground">{title}</h2>
					{description && (
						<p className="text-xs text-muted-foreground">{description}</p>
					)}
				</div>
			</div>
			{onAction && (
				<button
					type="button"
					onClick={onAction}
					className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
				>
					{actionLabel}
					<ArrowRight className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}

export function DashboardOverview({ onViewSales, onViewSLA, onViewJobs }) {
	const [filter, setFilter] = useState("7d");
	const { api } = useApi();

	const todayLabel = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	// Dashboard Stats State
	const [stats, setStats] = useState(null);
	const [statsLoading, setStatsLoading] = useState(false);
	const [statsError, setStatsError] = useState(null);

	// Sales Summary State (separate from repair stats — see the Sales page for full records)
	const [salesSummary, setSalesSummary] = useState(null);
	const [salesLoading, setSalesLoading] = useState(true);
	const [websiteSalesToday, setWebsiteSalesToday] = useState(null);

	useEffect(() => {
		let mounted = true;
		Promise.all([getSalesSummary("today"), fetchWebsiteSalesSummary(api, "today")]).then(
			([summary, website]) => {
				if (!mounted) return;
				setSalesSummary(summary);
				setWebsiteSalesToday(website);
				setSalesLoading(false);
			},
		);
		return () => {
			mounted = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sales revenue for the SAME period as the repair stats filter below, so the
	// two can be combined into one "Total Business Revenue" figure.
	const [periodSalesRevenue, setPeriodSalesRevenue] = useState(null);
	const [periodSalesLoading, setPeriodSalesLoading] = useState(true);
	const [periodSalesIncludesWebsite, setPeriodSalesIncludesWebsite] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setPeriodSalesLoading(true);
		Promise.all([getSalesSummary(filter), fetchWebsiteSalesSummary(api, filter)]).then(
			([inStore, website]) => {
				if (cancelled) return;
				setPeriodSalesRevenue(inStore.totalRevenue + (website?.revenue ?? 0));
				setPeriodSalesIncludesWebsite(website !== null);
				setPeriodSalesLoading(false);
			},
		);
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filter]);

	// Recent Activity State
	const [recentActivity, setRecentActivity] = useState([]);
	const [activityLoading, setActivityLoading] = useState(false);
	const [activityError, setActivityError] = useState(null);

	// System Alerts State
	const [alerts, setAlerts] = useState([]);
	const [alertsLoading, setAlertsLoading] = useState(false);
	const [alertsError, setAlertsError] = useState(null);

	// Re-fetch stats when filter changes
	useEffect(() => {
		let cancelled = false;
		const fetchStats = async () => {
			setStatsLoading(true);
			setStatsError(null);
			try {
				const res = await api.get(
					`/jobs/admin/dashboard/stats/?range=${filter}`,
				);
				if (!cancelled) setStats(res?.data?.result || null);
			} catch (e) {
				if (!cancelled) setStatsError("Failed to load dashboard stats");
				console.error("Error fetching dashboard stats:", e);
			} finally {
				if (!cancelled) setStatsLoading(false);
			}
		};
		fetchStats();
		return () => {
			cancelled = true;
		};
	}, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

	// Fetch activity & alerts once on mount
	useEffect(() => {
		let cancelled = false;
		const fetchRecentActivity = async () => {
			setActivityLoading(true);
			setActivityError(null);
			try {
				const res = await api.get("/notifications/events/recent_activity/");
				const data = res?.data?.result?.results || [];
				if (!cancelled) setRecentActivity(Array.isArray(data) ? data : []);
			} catch (e) {
				if (!cancelled) setActivityError("Failed to load recent activity");
				console.error("Error fetching recent activity:", e);
			} finally {
				if (!cancelled) setActivityLoading(false);
			}
		};
		const fetchSystemAlerts = async () => {
			setAlertsLoading(true);
			setAlertsError(null);
			try {
				const res = await api.get("/notifications/events/system_alerts/");
				const data = res?.data?.result?.results || [];
				if (!cancelled) setAlerts(Array.isArray(data) ? data : []);
			} catch (e) {
				if (!cancelled) setAlertsError("Failed to load system alerts");
				console.error("Error fetching system alerts:", e);
			} finally {
				if (!cancelled) setAlertsLoading(false);
			}
		};
		fetchRecentActivity();
		fetchSystemAlerts();
		return () => {
			cancelled = true;
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Derived data from stats. Active Jobs / Pending Verifications / Active
	// Technicians were removed here — they're already covered in more useful
	// detail by the Repair Status breakdown below, so keeping them here too
	// was just the same numbers stated twice.
	const statsCards = stats
		? [
				{
					// Same three revenue channels as Payment & Finance's "Total
					// Revenue (All-Time)" and the Reports tab's "Job Revenue" +
					// "POS Revenue" pair (jobs, in-store POS, website) — this one
					// is scoped to the selected time-range filter instead of
					// all-time or a custom date range.
					title: "Total Revenue",
					value: periodSalesLoading
						? formatCurrency(stats.stats.revenue)
						: formatCurrency(stats.stats.revenue + (periodSalesRevenue ?? 0)),
					change: formatDelta(stats.deltas.revenue_change_pct),
					note: periodSalesIncludesWebsite
						? `Jobs + in-store + website — ${FILTER_LABELS[filter]?.toLowerCase() || "selected period"}`
						: `Jobs + in-store (this device only) — website not synced yet — ${FILTER_LABELS[filter]?.toLowerCase() || "selected period"}`,
					icon: NairaIcon,
					color: "text-success",
					bgColor: "bg-success/10",
				},
			]
		: [];

	// Sales-only revenue for today (in-store + website, when available) — kept
	// separate from the "Total Revenue" stat below, which mixes in repair jobs
	// revenue for the selected time-range filter instead of just today.
	const todaySalesRevenue = (salesSummary?.totalRevenue ?? 0) + (websiteSalesToday?.revenue ?? 0);

	const jobVolumeData =
		stats?.weekly_volume?.map((d) => ({
			day: formatDay(d.day),
			jobs: d.count,
			fullDate: d.day,
		})) || [];

	const revenueData =
		stats?.revenue_trend?.map((d) => ({
			month: formatMonth(d.month),
			revenue: d.amount,
		})) || [];

	const jobDistribution = stats?.job_distribution
		? Object.entries(stats.job_distribution).map(([name, value]) => ({
				name: name.charAt(0).toUpperCase() + name.slice(1),
				value,
				color: JOB_STATUS_COLORS[name] || "#94a3b8",
			}))
		: [];

	const getJobVolumeTitle = () => {
		if (filter === "1d") return "Hourly Job Volume";
		if (filter === "3d" || filter === "7d") return "Daily Job Volume";
		if (filter === "30d" || filter === "90d") return "Weekly Job Volume";
		return "Job Volume";
	};

	const getActivityStatus = (category, priority) => {
		if (category === "user" && priority === "LOW") return "new";
		if (category === "job" && priority === "MEDIUM") return "success";
		if (priority === "HIGH") return "warning";
		return "pending";
	};

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-card via-card to-secondary/30 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-6">
				<div>
					<p className="text-base font-semibold text-foreground">{todayLabel}</p>
					<p className="text-sm text-muted-foreground">Figures below follow the time range you choose.</p>
				</div>

				<Select value={filter} onValueChange={setFilter}>
					<SelectTrigger className="w-full sm:w-[200px]">
						<SelectValue placeholder="Select Time Range" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="1d">Last 24 hours</SelectItem>
						<SelectItem value="3d">Last 3 days</SelectItem>
						<SelectItem value="7d">Last 7 days</SelectItem>
						<SelectItem value="30d">Last 30 days</SelectItem>
						<SelectItem value="90d">Last 90 days</SelectItem>
						<SelectItem value="all">All time</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Sales */}
			<div className="space-y-4">
				<SectionHeading
					icon={Wallet}
					title="Sales"
					description="This device, today"
					actionLabel={onViewSales ? "View All" : undefined}
					onAction={onViewSales ? () => onViewSales() : undefined}
				/>

				{salesLoading ? (
					<div className="flex items-center justify-center py-4">
						<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
					</div>
				) : (
					<div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
						<StatCard
							title="Total Revenue"
							value={formatCurrency(todaySalesRevenue)}
							note={websiteSalesToday ? "Includes website" : "In-store only"}
							icon={Wallet}
							color="text-success"
							bgColor="bg-success/10"
							onClick={
								onViewSales ? () => onViewSales({ dateScope: "today" }) : undefined
							}
						/>
						<StatCard
							title="Sales Count"
							value={salesSummary?.totalSalesCount ?? 0}
							icon={ShoppingCart}
							color="text-cyan-500"
							bgColor="bg-cyan-50"
							onClick={
								onViewSales ? () => onViewSales({ dateScope: "today" }) : undefined
							}
						/>
						<StatCard
							title="Top Selling Item"
							value={salesSummary?.topSellingItems?.[0]?.name ?? "—"}
							icon={TrendingUp}
							color="text-purple-600"
							bgColor="bg-purple-50"
							onClick={
								onViewSales
									? () =>
											onViewSales({
												dateScope: "today",
												...(salesSummary?.topSellingItems?.[0]?.name
													? { search: salesSummary.topSellingItems[0].name }
													: {}),
											})
									: undefined
							}
						/>
						<StatCard
							title="In-Store"
							value={salesSummary?.channelBreakdown?.in_store ?? 0}
							icon={Store}
							color="text-blue-500"
							bgColor="bg-blue-50"
							onClick={
								onViewSales
									? () => onViewSales({ dateScope: "today", channel: "in_store" })
									: undefined
							}
						/>
						{websiteSalesToday ? (
							<StatCard
								title="Website"
								value={websiteSalesToday.count}
								note={formatCurrency(websiteSalesToday.revenue)}
								icon={Globe}
								color="text-indigo-500"
								bgColor="bg-indigo-50"
								onClick={
									onViewSales
										? () => onViewSales({ dateScope: "today", channel: "website" })
										: undefined
								}
							/>
						) : (
							<StatCard
								title="Website"
								value="—"
								note="Not available yet"
								icon={Globe}
								color="text-muted-foreground"
								bgColor="bg-secondary"
								onClick={
									onViewSales
										? () => onViewSales({ dateScope: "today", channel: "website" })
										: undefined
								}
							/>
						)}
					</div>
				)}
			</div>

			{/* Repair Performance — repair status snapshot + SLA risk, separate from sales */}
			<div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-6">
				<RepairPerformance onViewSLA={onViewSLA} onViewJobs={onViewJobs} />
			</div>

			{/* Stats Grid */}
			{statsLoading ? (
				<div className="flex items-center justify-center py-10">
					<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			) : statsError ? (
				<div className="text-center py-8 text-muted-foreground">
					<p>{statsError}</p>
				</div>
			) : (
				<>
					<SectionHeading
						icon={BarChart3}
						title="Performance & Trends"
						description={FILTER_LABELS[filter] || "—"}
					/>

					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						{statsCards.map((stat) => (
							<StatCard key={stat.title} {...stat} />
						))}
					</div>

					{/* Charts Row */}
					<div className="grid gap-4 md:grid-cols-2">
						<Card className="rounded-xl border-border/60 shadow-sm">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<BarChart3 className="h-4 w-4 text-primary" />
									{getJobVolumeTitle()}
								</CardTitle>
								<CardDescription>
									Jobs created — {FILTER_LABELS[filter] || "—"}
									{stats?.weekly_volume_change_pct !== undefined && (
										<span
											className={`ml-2 font-medium ${
												stats.weekly_volume_change_pct >= 0
													? "text-success"
													: "text-error"
											}`}
										>
											{formatDeltaFixed(stats.weekly_volume_change_pct, 2)} vs
											prev period
										</span>
									)}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer width="100%" height={260}>
									<BarChart data={jobVolumeData} barSize={24} margin={{ left: -12 }}>
										<defs>
											<linearGradient id="jobVolumeGradient" x1="0" y1="0" x2="0" y2="1">
												<stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
												<stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.6} />
											</linearGradient>
										</defs>
										<CartesianGrid vertical={false} stroke="var(--border)" />
										<XAxis
											dataKey="day"
											tick={chartAxisTick}
											tickLine={false}
											axisLine={false}
										/>
										<YAxis
											tick={chartAxisTick}
											allowDecimals={false}
											tickLine={false}
											axisLine={false}
											width={32}
										/>
										<Tooltip
											cursor={{ fill: "var(--accent)", opacity: 0.5 }}
											contentStyle={chartTooltipStyle}
										/>
										<Bar dataKey="jobs" name="Jobs" fill="url(#jobVolumeGradient)" radius={[6, 6, 0, 0]} maxBarSize={32} />
									</BarChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>

						<Card className="rounded-xl border-border/60 shadow-sm">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<TrendingUp className="h-4 w-4 text-primary" />
									Revenue Trend
								</CardTitle>
								<CardDescription>
									Monthly revenue — {FILTER_LABELS[filter] || "—"}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer width="100%" height={260}>
									<AreaChart data={revenueData}>
										<defs>
											<linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
												<stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.4} />
												<stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
											</linearGradient>
										</defs>
										<CartesianGrid vertical={false} stroke="var(--border)" />
										<XAxis
											dataKey="month"
											tick={chartAxisTick}
											tickLine={false}
											axisLine={false}
										/>
										<YAxis
											tick={chartAxisTick}
											tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
											tickLine={false}
											axisLine={false}
											width={44}
										/>
										<Tooltip
											formatter={(v) => [formatCurrency(v), "Revenue"]}
											contentStyle={chartTooltipStyle}
										/>
										<Area
											type="monotone"
											dataKey="revenue"
											name="Revenue"
											stroke="var(--chart-4)"
											strokeWidth={2.5}
											fill="url(#revenueGradient)"
											activeDot={{ r: 5, strokeWidth: 2 }}
										/>
									</AreaChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>
					</div>

					{/* Job Status & Activity */}
					<div className="grid gap-4 md:grid-cols-3">
						<Card className="rounded-xl border-border/60 shadow-sm">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<PieChartIcon className="h-4 w-4 text-primary" />
									Job Status Distribution
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="relative">
									<ResponsiveContainer width="100%" height={200}>
										<PieChart>
											<Pie
												data={jobDistribution}
												cx="50%"
												cy="50%"
												innerRadius={55}
												outerRadius={80}
												paddingAngle={3}
												dataKey="value"
												stroke="var(--card)"
												strokeWidth={2}
											>
												{jobDistribution.map((entry, index) => (
													<Cell key={`cell-${index}`} fill={entry.color} />
												))}
											</Pie>
											<Tooltip contentStyle={chartTooltipStyle} />
										</PieChart>
									</ResponsiveContainer>
									<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
										<span className="text-xl font-semibold tracking-tight text-foreground">
											{jobDistribution.reduce((sum, item) => sum + item.value, 0)}
										</span>
										<span className="text-[11px] text-muted-foreground">Total Jobs</span>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-2 mt-4">
									{jobDistribution.map((item) => (
										<div key={item.name} className="flex items-center gap-2">
											<div
												className="w-2.5 h-2.5 rounded-full"
												style={{ backgroundColor: item.color }}
											/>
											<span className="text-xs text-muted-foreground">
												{item.name}: <span className="font-medium text-foreground">{item.value}</span>
											</span>
										</div>
									))}
								</div>
							</CardContent>
						</Card>

						<Card className="rounded-xl border-border/60 shadow-sm md:col-span-2">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Activity className="h-4 w-4 text-primary" />
									Recent Activity
								</CardTitle>
								<CardDescription>Latest platform events</CardDescription>
							</CardHeader>
							<CardContent>
								{activityLoading ? (
									<div className="flex items-center justify-center py-8">
										<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
									</div>
								) : activityError ? (
									<div className="text-center py-8 text-muted-foreground">
										<p>{activityError}</p>
									</div>
								) : recentActivity.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground">
										<p>No recent activity</p>
									</div>
								) : (
									<div className="space-y-4 max-h-[280px] overflow-y-auto">
										{recentActivity.slice(0, 5).map((activity) => (
											<div
												key={activity.id}
												className="flex items-start gap-4 pb-4 border-b last:border-0"
											>
												<div
													className={`w-2 h-2 mt-2 rounded-full ${
														getActivityStatus(
															activity.category,
															activity.priority,
														) === "success"
															? "bg-success"
															: getActivityStatus(
																		activity.category,
																		activity.priority,
																  ) === "warning"
																? "bg-warning"
																: getActivityStatus(
																			activity.category,
																			activity.priority,
																	  ) === "pending"
																	? "bg-purple-500"
																	: "bg-gray-500"
													}`}
												/>
												<div className="flex-1 min-w-0">
													<p className="text-sm">
														{activity.actor_name}{" "}
														{activity.action.toLowerCase()}{" "}
														{activity.object_display}
													</p>
													<p className="text-xs text-muted-foreground mt-1">
														{activity.time_ago}
													</p>
												</div>
												<Badge variant="outline" className="text-xs">
													{activity.category}
												</Badge>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</>
			)}

			{/* Alerts */}
			<Card className="rounded-xl border-border/60 shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<AlertCircle className="h-4 w-4 text-primary" />
						System Alerts
					</CardTitle>
					<CardDescription>
						Important notifications requiring attention
					</CardDescription>
				</CardHeader>
				<CardContent>
					{alertsLoading ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
						</div>
					) : alertsError ? (
						<div className="text-center py-8 text-muted-foreground">
							<p>{alertsError}</p>
						</div>
					) : alerts.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<p>No system alerts</p>
						</div>
					) : (
						<div className="space-y-4">
							{alerts.map((alert) => (
								<div
									key={alert.id}
									className="flex items-center gap-4 rounded-lg border border-border/60 p-4 transition-colors hover:bg-secondary/40"
								>
									<span
										className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
											alert.priority === "HIGH"
												? "bg-error/10"
												: alert.priority === "MEDIUM"
													? "bg-warning/10"
													: "bg-purple-50"
										}`}
									>
										<AlertCircle
											className={`w-4 h-4 ${
												alert.priority === "HIGH"
													? "text-error"
													: alert.priority === "MEDIUM"
														? "text-warning"
														: "text-purple-600"
											}`}
										/>
									</span>
									<div className="flex-1">
										<h4 className="text-sm font-medium">{alert.title}</h4>
										<p className="text-xs text-muted-foreground">
											{alert.description}
										</p>
										<p className="text-xs text-muted-foreground mt-1">
											{alert.time_ago}
										</p>
									</div>
									<Badge
										variant={
											alert.priority === "HIGH"
												? "destructive"
												: alert.priority === "MEDIUM"
													? "default"
													: "secondary"
										}
									>
										{alert.priority.toLowerCase()}
									</Badge>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
