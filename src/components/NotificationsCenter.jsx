import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";

import {
	Send,
	Bell,
	Mail,
	Smartphone,
	MessageSquare,
	ChevronLeft,
	ChevronRight,
	Loader2,
} from "lucide-react";

import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function PaginationBar({
	page,
	pages,
	pageSize,
	canPrev,
	canNext,
	onPrev,
	onNext,
	onPageSizeChange,
}) {
	return (
		<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4">
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					onClick={onPrev}
					disabled={!canPrev}
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>

				<div className="text-sm text-muted-foreground">
					Page <span className="font-medium text-foreground">{page}</span>{" "}
					<span className="text-muted-foreground">of</span>{" "}
					<span className="font-medium text-foreground">{pages || 1}</span>
				</div>

				<Button
					variant="outline"
					size="icon"
					onClick={onNext}
					disabled={!canNext}
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex items-center gap-2 justify-end">
				<span className="text-sm text-muted-foreground">Show</span>

				<Select
					value={String(pageSize)}
					onValueChange={(v) => onPageSizeChange(Number(v))}
				>
					<SelectTrigger className="w-[95px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PAGE_SIZE_OPTIONS.map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<span className="text-sm text-muted-foreground">entries</span>
			</div>
		</div>
	);
}

export function NotificationsCenter() {
	const { api } = useApi();

	// Form state
	const [targetGroup, setTargetGroup] = useState("all");
	const [userIdentifier, setUserIdentifier] = useState("");
	const [channels, setChannels] = useState(["in_app"]);
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [notificationType, setNotificationType] = useState("info");
	const [actionUrl, setActionUrl] = useState("");
	const [isSending, setIsSending] = useState(false);

	// History: API-driven events
	const [events, setEvents] = useState([]);
	const [eventsLoading, setEventsLoading] = useState(false);

	// Pagination (must match backend)
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [pagination, setPagination] = useState({
		count: 0,
		pages: 1,
		page: 1,
		page_size: 20,
		next: null,
		previous: null,
	});

	const channelOptions = [
		{ value: "in_app", label: "In-App", icon: Bell },
		{ value: "email", label: "Email", icon: Mail },
		{ value: "sms", label: "SMS", icon: MessageSquare },
		{ value: "push", label: "Push", icon: Smartphone },
	];

	const handleChannelToggle = (channel) => {
		setChannels((prev) =>
			prev.includes(channel)
				? prev.filter((c) => c !== channel)
				: [...prev, channel],
		);
	};

	const handleSendNotification = async (e) => {
		e.preventDefault();

		// Validation
		if (channels.length === 0) {
			toast.error("Please select at least one delivery channel");
			return;
		}

		if (!subject.trim()) {
			toast.error("Please enter a subject");
			return;
		}

		if (!message.trim()) {
			toast.error("Please enter a message");
			return;
		}

		if (targetGroup === "single_user" && !userIdentifier.trim()) {
			toast.error(
				"Please enter a user identifier (email, phone, username, or ID)",
			);
			return;
		}

		setIsSending(true);

		try {
			const payload = {
				target_group: targetGroup,
				channels: channels,
				subject: subject.trim(),
				message: message.trim(),
				notification_type: notificationType,
			};

			// Add user_identifier only if single_user
			if (targetGroup === "single_user") {
				payload.user_identifier = userIdentifier.trim();
			}

			// Add action_url only if provided
			if (actionUrl.trim()) {
				payload.action_url = actionUrl.trim();
			}

			await api.post("/notifications/notifications/broadcast/", payload);

			toast.success("Notification sent successfully!");

			// Reset form
			setTargetGroup("all");
			setUserIdentifier("");
			setChannels(["in_app"]);
			setSubject("");
			setMessage("");
			setNotificationType("info");
			setActionUrl("");

			// Refresh history
			fetchEvents();
		} catch (err) {
			console.error("Failed to send notification:", err);
			const errorMsg =
				err?.response?.data?.message ||
				err?.message ||
				"Failed to send notification";
			toast.error(errorMsg);
		} finally {
			setIsSending(false);
		}
	};

	const getTypeIcon = (eventType) => {
		const t = String(eventType || "").toUpperCase();
		if (t === "ALERT") return <Bell className="h-4 w-4 mr-1" />;
		return <MessageSquare className="h-4 w-4 mr-1" />; // ACTIVITY + anything else
	};

	const getPriorityBadgeVariant = (priority) => {
		const p = String(priority || "").toUpperCase();
		if (p === "HIGH" || p === "URGENT") return "destructive";
		if (p === "MEDIUM") return "default";
		return "secondary"; // LOW (and fallback)
	};

	const fetchEvents = async () => {
		setEventsLoading(true);
		try {
			const res = await api.get(
				`/notifications/events/?page=${page}&page_size=${pageSize}`,
			);
			const data = res?.data || {};

			const list = Array.isArray(data.result) ? data.result : [];
			const pg = data.pagination || {};

			setEvents(list);

			setPagination({
				count: pg.count ?? list.length,
				pages: pg.pages ?? 1,
				page: pg.page ?? page,
				page_size: pg.page_size ?? pageSize,
				next: pg.next ?? null,
				previous: pg.previous ?? null,
			});
		} catch (err) {
			console.error("Failed to load notification events:", err);
			toast.error("Failed to load notification history");
			setEvents([]);
			setPagination({
				count: 0,
				pages: 1,
				page,
				page_size: pageSize,
				next: null,
				previous: null,
			});
		} finally {
			setEventsLoading(false);
		}
	};

	useEffect(() => {
		fetchEvents();
	}, [page, pageSize]);

	return (
		<div className="space-y-6">
			<div>
				<h1>Notifications & Messaging Center</h1>
				<p className="text-muted-foreground">
					Manage platform-wide communication
				</p>
			</div>

			<Tabs defaultValue="send" className="space-y-4">
				<TabsList>
					<TabsTrigger value="send">Send Notification</TabsTrigger>
					<TabsTrigger value="history">History</TabsTrigger>
				</TabsList>

				<TabsContent value="send" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Send className="w-5 h-5" />
								Send New Notification
							</CardTitle>
							<CardDescription>
								Broadcast messages to users or send targeted communications
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-6">
								<div className="space-y-2">
									<Label>Delivery Channels</Label>
									<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
										{channelOptions.map(({ value, label, icon: Icon }) => (
											<div
												key={value}
												className={`flex items-center space-x-2 p-4 border rounded-lg cursor-pointer transition-colors ${
													channels.includes(value)
														? "bg-primary/10 border-primary"
														: "hover:bg-muted/50"
												}`}
												onClick={() => handleChannelToggle(value)}
											>
												<Checkbox
													id={`channel-${value}`}
													checked={channels.includes(value)}
													onCheckedChange={() => handleChannelToggle(value)}
												/>
												<Label
													htmlFor={`channel-${value}`}
													className="flex items-center gap-2 cursor-pointer font-normal"
												>
													<Icon className="w-4 h-4" />
													{label}
												</Label>
											</div>
										))}
									</div>
									<p className="text-xs text-muted-foreground">
										Select at least one channel. Users will only receive
										notifications via channels where they have contact info.
									</p>
								</div>

								<div className="space-y-2">
									<Label>Recipients</Label>
									<Select value={targetGroup} onValueChange={setTargetGroup}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Users</SelectItem>
											<SelectItem value="customers">Customers Only</SelectItem>
											<SelectItem value="technicians">
												Technicians Only
											</SelectItem>
											<SelectItem value="verified_technicians">
												Verified Technicians
											</SelectItem>
											<SelectItem value="active_users">
												Active Users (Last 30 days)
											</SelectItem>
											<SelectItem value="admins">Admins</SelectItem>
											<SelectItem value="single_user">Single User</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{targetGroup === "single_user" && (
									<div className="space-y-2">
										<Label>User Identifier</Label>
										<Input
											placeholder="Enter user ID, email, phone number, or username"
											value={userIdentifier}
											onChange={(e) => setUserIdentifier(e.target.value)}
										/>
										<p className="text-xs text-muted-foreground">
											You can use user ID, email address, phone number, or
											username
										</p>
									</div>
								)}

								<div className="space-y-2">
									<Label>Subject / Title</Label>
									<Input
										placeholder="Enter notification subject"
										value={subject}
										onChange={(e) => setSubject(e.target.value)}
									/>
								</div>

								<div className="space-y-2">
									<Label>Message</Label>
									<Textarea
										placeholder="Enter your message here..."
										className="min-h-[150px]"
										value={message}
										onChange={(e) => setMessage(e.target.value)}
									/>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-2">
										<Label>Notification Type</Label>
										<Select
											value={notificationType}
											onValueChange={setNotificationType}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="info">Info</SelectItem>
												<SelectItem value="alert">Alert</SelectItem>
												<SelectItem value="warning">Warning</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<Label>Action URL (Optional)</Label>
										<Input
											placeholder="https://example.com/action"
											value={actionUrl}
											onChange={(e) => setActionUrl(e.target.value)}
										/>
									</div>
								</div>
								<div className="flex justify-self-end pt-4">
									<Button
										onClick={handleSendNotification}
										className="w-full"
										disabled={isSending}
									>
										{isSending ? (
											<>
												<Loader2 className="w-4 h-4 mr-2 animate-spin" />
												Sending...
											</>
										) : (
											<>
												<Send className="w-4 h-4 mr-2" />
												Send Notification
											</>
										)}
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="history">
					<Card>
						<CardHeader>
							<CardTitle>Notification History</CardTitle>
							<CardDescription>
								System events and notification activity from the platform
							</CardDescription>
						</CardHeader>

						<CardContent>
							<div className="relative">
								{eventsLoading && (
									<div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-md z-10">
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin" />
											Loading history...
										</div>
									</div>
								)}

								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Type</TableHead>
											<TableHead>Title</TableHead>
											<TableHead>Message</TableHead>
											<TableHead>Actor</TableHead>
											<TableHead>Priority</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Date</TableHead>
										</TableRow>
									</TableHeader>

									<TableBody>
										{!eventsLoading && events.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={7}
													className="text-center text-sm text-muted-foreground py-10"
												>
													No history found
												</TableCell>
											</TableRow>
										) : (
											events.map((ev) => (
												<TableRow key={ev.id}>
													<TableCell>
														<Badge variant="outline" className="capitalize">
															{getTypeIcon(ev.event_type)}
															{String(ev.event_type || "").toLowerCase()}
														</Badge>
													</TableCell>

													<TableCell className="font-medium">
														<div className="space-y-0.5">
															<div>{ev.title || "—"}</div>
															<div className="text-xs text-muted-foreground">
																{ev.category || "—"}
																{ev.object_id_display
																	? ` • ${ev.object_id_display}`
																	: ""}
															</div>
														</div>
													</TableCell>

													<TableCell className="max-w-[360px] truncate">
														{ev.message || "—"}
													</TableCell>

													<TableCell className="text-muted-foreground">
														{ev.actor_name || "—"}
													</TableCell>

													<TableCell>
														<Badge
															variant={getPriorityBadgeVariant(ev.priority)}
															className="capitalize"
														>
															{String(ev.priority || "LOW").toLowerCase()}
														</Badge>
													</TableCell>

													<TableCell>
														<Badge
															variant={
																ev.is_read_by_admin ? "secondary" : "default"
															}
														>
															{ev.is_read_by_admin ? "read" : "unread"}
														</Badge>
													</TableCell>

													<TableCell className="text-muted-foreground">
														{ev.time_ago || "—"}
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>

								<PaginationBar
									page={pagination?.page || page}
									pages={pagination?.pages || 1}
									pageSize={pageSize}
									canPrev={Boolean(pagination?.previous) && page > 1}
									canNext={Boolean(pagination?.next)}
									onPrev={() => setPage((p) => Math.max(1, p - 1))}
									onNext={() => setPage((p) => p + 1)}
									onPageSizeChange={(n) => {
										setPageSize(n);
										setPage(1);
									}}
								/>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
