import { useMemo, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
	Mail,
	Phone,
	Calendar,
	MapPin,
	Briefcase,
	DollarSign,
	CheckCircle,
	XCircle,
	Pencil,
} from "lucide-react";
import { EditCustomerModal } from "./EditCustomerModal";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "./ui/alert-dialog";
import { ScrollArea } from "./ui/scroll-area";
import { useApi } from "../hooks/useApi";

const MEDIA_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://backend.staging.cybersquadapp.com";

function toAbsoluteUrl(path) {
	if (!path) return null;
	if (/^https?:\/\//i.test(path)) return path;
	return `${MEDIA_BASE_URL}${path}`;
}

export function CustomerDetailsModal({
	open,
	onOpenChange,
	customer,
	onUpdated,
}) {
	const { api } = useApi();

	// ✅ ALL HOOKS FIRST
	const [showSuspendDialog, setShowSuspendDialog] = useState(false);
	const [showReactivateDialog, setShowReactivateDialog] = useState(false);
	const [showEditDialog, setShowEditDialog] = useState(false);
	const [actionLoading, setActionLoading] = useState(false);

	// ✅ Memoized values with safe defaults
	const fullName = useMemo(() => {
		if (!customer) return "-";
		return customer?.first_name || customer?.last_name
			? `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim()
			: customer?.profile?.full_name || "-";
	}, [customer]);

	const email = useMemo(() => customer?.email || "-", [customer]);
	const phone = useMemo(() => customer?.phone_number || "-", [customer]);

	const location = useMemo(() => {
		if (!customer) return "-";
		const p = customer?.profile || {};
		const parts = [p?.city, p?.state, p?.country].filter(Boolean);
		if (parts.length) return parts.join(", ");
		if (p?.address) return p.address;
		return "-";
	}, [customer]);

	const joinedDate = useMemo(() => {
		if (!customer?.date_joined) return "-";
		try {
			const date = new Date(customer.date_joined);
			return date.toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			});
		} catch (e) {
			return "-";
		}
	}, [customer]);

	const avatarUrl = useMemo(
		() => toAbsoluteUrl(customer?.profile?.avatar),
		[customer],
	);

	const isSuspended = useMemo(() => !Boolean(customer?.is_active), [customer]);

	const isProfileComplete = useMemo(
		() => Boolean(customer?.profile?.is_profile_complete),
		[customer],
	);

	const totalJobs = useMemo(() => customer?.stats?.total_jobs || 0, [customer]);
	const totalSpent = useMemo(
		() => customer?.stats?.total_spent || 0,
		[customer],
	);

	const defaultAddress = useMemo(() => {
		if (!customer?.profile?.addresses) return null;
		return customer.profile.addresses.find((addr) => addr.is_default);
	}, [customer]);

	// ✅ NOW safe to return early
	if (!customer) return null;

	const getInitials = (name) => {
		const safe = (name || "").trim();
		if (!safe) return "NA";
		return safe
			.split(" ")
			.filter(Boolean)
			.slice(0, 2)
			.map((n) => n[0])
			.join("")
			.toUpperCase();
	};

	const handleSuspend = async () => {
		try {
			setActionLoading(true);
			await api.post(`/users/profile/${customer?.id}/suspend/`, {
				action: "suspend",
			});

			toast.success(`${fullName}'s account has been suspended.`);

			setShowSuspendDialog(false);
			onOpenChange(false);
			onUpdated?.();
		} catch (e) {
			console.error("Suspend failed:", e);
			toast.error("Failed to suspend account. Please try again.");
		} finally {
			setActionLoading(false);
		}
	};

	const handleReactivate = async () => {
		try {
			setActionLoading(true);
			await api.post(`/users/profile/${customer?.id}/suspend/`, {
				action: "activate",
			});

			toast.success(`${fullName}'s account has been reactivated successfully!`);

			setShowReactivateDialog(false);
			onOpenChange(false);
			onUpdated?.();
		} catch (e) {
			console.error("Reactivate failed:", e);
			toast.error("Failed to reactivate account. Please try again.");
		} finally {
			setActionLoading(false);
		}
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-3xl max-h-[90vh]">
					<DialogHeader>
						<DialogTitle>Customer Details</DialogTitle>
						<DialogDescription>
							Complete information and activity history
						</DialogDescription>
					</DialogHeader>

					<ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
						<div className="space-y-6">
							{/* Customer Header */}
							<div className="flex items-start gap-4">
								<Avatar className="w-16 h-16">
									{avatarUrl ? (
										<AvatarImage src={avatarUrl} alt={fullName} />
									) : null}
									<AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
										{getInitials(fullName)}
									</AvatarFallback>
								</Avatar>
								<div className="flex-1">
									<div className="flex items-start justify-between">
										<div>
											<h3 className="font-semibold">{fullName}</h3>
											<p className="text-sm text-muted-foreground">{email}</p>
											<div className="flex items-center gap-2 mt-2">
												<Badge
													variant={isProfileComplete ? "default" : "outline"}
													className="text-xs"
												>
													{isProfileComplete
														? "Profile Complete"
														: "Profile Incomplete"}
												</Badge>
											</div>
										</div>
										{isSuspended ? (
											<Badge className="bg-error text-white">
												<XCircle className="h-4 w-4" />
												<span className="ml-1">suspended</span>
											</Badge>
										) : (
											<Badge className="bg-success text-white">
												<CheckCircle className="h-4 w-4" />
												<span className="ml-1">active</span>
											</Badge>
										)}
									</div>
								</div>
							</div>

							<Separator />

							{/* Contact Information */}
							<div className="space-y-4">
								<h4 className="font-medium">Contact Information</h4>
								<div className="grid gap-4">
									<div className="flex items-center gap-4 text-sm">
										<Mail className="w-4 h-4 text-muted-foreground" />
										<span className="text-muted-foreground">Email:</span>
										<span>{email}</span>
									</div>
									<div className="flex items-center gap-4 text-sm">
										<Phone className="w-4 h-4 text-muted-foreground" />
										<span className="text-muted-foreground">Phone:</span>
										<span>{phone}</span>
									</div>
									<div className="flex items-center gap-4 text-sm">
										<MapPin className="w-4 h-4 text-muted-foreground" />
										<span className="text-muted-foreground">Location:</span>
										<span>{location}</span>
									</div>
									<div className="flex items-center gap-4 text-sm">
										<Calendar className="w-4 h-4 text-muted-foreground" />
										<span className="text-muted-foreground">Joined:</span>
										<span>{joinedDate}</span>
									</div>
								</div>
							</div>

							<Separator />

							{/* Customer Stats */}
							<div className="space-y-4">
								<h4 className="font-medium">Activity Stats</h4>
								<div className="grid grid-cols-2 gap-4">
									<div className="p-4 border rounded-lg">
										<div className="flex items-center gap-2 text-muted-foreground mb-1">
											<Briefcase className="w-4 h-4" />
											<span className="text-xs">Total Jobs</span>
										</div>
										<p className="text-2xl font-semibold">{totalJobs}</p>
									</div>
									<div className="p-4 border rounded-lg">
										<div className="flex items-center gap-2 text-muted-foreground mb-1">
											<p className="text-sm">₦ Total Spent</p>
										</div>
										<p className="text-2xl font-semibold">
											₦{totalSpent.toLocaleString()}
										</p>
									</div>
								</div>
							</div>

							<Separator />

							{/* Default Address */}
							{defaultAddress && (
								<>
									<div className="space-y-4">
										<h4 className="font-medium">Default Address</h4>
										<div className="p-4 border rounded-lg bg-muted/30">
											<div className="space-y-2 text-sm">
												<p className="font-medium">{defaultAddress.line1}</p>
												{defaultAddress.line2 && <p>{defaultAddress.line2}</p>}
												<p className="text-muted-foreground">
													{[
														defaultAddress.city,
														defaultAddress.lga,
														defaultAddress.state,
														defaultAddress.country,
													]
														.filter(Boolean)
														.join(", ")}
												</p>
												{defaultAddress.postal_code && (
													<p className="text-muted-foreground">
														Postal Code: {defaultAddress.postal_code}
													</p>
												)}
											</div>
										</div>
									</div>
									<Separator />
								</>
							)}

							{/* All Addresses */}
							{customer?.profile?.addresses &&
								customer.profile.addresses.length > 0 && (
									<div className="space-y-4">
										<h4 className="font-medium">
											All Addresses ({customer.profile.addresses.length})
										</h4>
										<div className="space-y-2 max-h-[200px] overflow-y-auto">
											{customer.profile.addresses.map((addr) => (
												<div
													key={addr.id}
													className="p-4 border rounded-lg text-sm"
												>
													<div className="flex items-start justify-between">
														<div className="flex-1">
															<p className="font-medium">{addr.line1}</p>
															<p className="text-muted-foreground text-xs mt-1">
																{[addr.city, addr.state, addr.country]
																	.filter(Boolean)
																	.join(", ")}
															</p>
														</div>
														{addr.is_default && (
															<Badge variant="secondary" className="text-xs">
																Default
															</Badge>
														)}
													</div>
												</div>
											))}
										</div>
									</div>
								)}

							{/* Action Buttons */}
							<div className="flex gap-2">
								<Button
									variant="outline"
									className="flex-1"
									onClick={() => setShowEditDialog(true)}
									disabled={actionLoading}
								>
									<Pencil className="w-4 h-4 mr-2" />
									Edit Details
								</Button>
								{isSuspended ? (
									<Button
										className="flex-1 bg-success hover:bg-success-700"
										onClick={() => setShowReactivateDialog(true)}
										disabled={actionLoading}
									>
										Reactivate Account
									</Button>
								) : (
									<Button
										variant="destructive"
										className="flex-1"
										onClick={() => setShowSuspendDialog(true)}
										disabled={actionLoading}
									>
										Suspend Account
									</Button>
								)}
							</div>
						</div>
					</ScrollArea>

					<Separator />
				</DialogContent>
			</Dialog>

			{/* Suspend Confirmation Dialog */}
			<AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Suspend Account?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to suspend {fullName}'s account? They will
							not be able to post new jobs until reactivated.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actionLoading}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleSuspend}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={actionLoading}
						>
							{actionLoading ? "Suspending..." : "Suspend"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Edit Customer Modal */}
			<EditCustomerModal
				open={showEditDialog}
				onOpenChange={setShowEditDialog}
				customer={customer}
				onUpdated={() => {
					onUpdated?.();
				}}
			/>

			{/* Reactivate Confirmation Dialog */}
			<AlertDialog
				open={showReactivateDialog}
				onOpenChange={setShowReactivateDialog}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reactivate Account?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to reactivate {fullName}'s account? They
							will regain full access to post jobs.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actionLoading}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleReactivate}
							className="bg-success text-white hover:bg-success-700"
							disabled={actionLoading}
						>
							{actionLoading ? "Reactivating..." : "Reactivate"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
