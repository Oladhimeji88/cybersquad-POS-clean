import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import { User, Calendar, DollarSign, Briefcase } from "lucide-react";
import { formatAmount } from "../lib/currency";

function formatDate(dateString) {
	if (!dateString) return "-";
	try {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "-";
	}
}

function getPayoutStateStyle(state) {
	switch (state) {
		case "PAID":
			return { backgroundColor: "#22c55e", color: "white" };
		case "READY_FOR_APPROVAL":
			return { backgroundColor: "#f97316", color: "white" };
		case "APPROVED":
		case "PROCESSING":
			return { backgroundColor: "#3b82f6", color: "white" };
		case "FAILED":
		case "REJECTED":
			return { backgroundColor: "#ef4444", color: "white" };
		default:
			return { backgroundColor: "#6b7280", color: "white" };
	}
}

function getTechnicianLabel(payout) {
	const techName = payout?.earnings?.technician_name;
	const techId = payout?.earnings?.technician_id;
	if (techName) return techName;
	if (techId) return `Technician #${techId}`;
	return "-";
}

export function PayoutDetailsModal({ open, onClose, payout }) {
	if (!payout) return null;

	// ✅ API shape: payout.earnings is an object
	const earnings = payout?.earnings || {};
	const breakdown = earnings?.breakdown || {};

	// ✅ Prefer top-level earnings fields, fallback to breakdown if needed
	const gross = earnings?.gross_amount ?? breakdown?.gross_amount;
	const commission =
		earnings?.platform_commission ?? breakdown?.platform_commission;
	const net = earnings?.technician_amount ?? breakdown?.technician_amount;

	const state = payout?.state || "-";
	const currency = payout?.currency || "NGN";

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>Payout Details</DialogTitle>
					<DialogDescription>
						Complete payout information for {getTechnicianLabel(payout)}
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="flex-1 pr-4">
					<div className="space-y-6">
						{/* Top summary */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Payout ID</p>
								<p className="font-medium">#{payout?.id ?? "-"}</p>
							</div>

							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">State</p>
								<Badge
									style={getPayoutStateStyle(state)}
									className="inline-flex items-center border-0"
								>
									{String(state).replace(/_/g, " ")}
								</Badge>
							</div>

							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Job ID</p>
								<p className="font-medium">#{payout?.job_id ?? "-"}</p>
							</div>

							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Created</p>
								<p className="font-medium">{formatDate(payout?.created_at)}</p>
							</div>
						</div>

						<Separator />

						{/* Main details */}
						<div className="space-y-4">
							<div className="flex items-start gap-4">
								<User className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<p className="text-sm text-muted-foreground">Technician</p>
									<p className="font-medium">{getTechnicianLabel(payout)}</p>
								</div>
							</div>

							<div className="flex items-start gap-4">
								<p className="w-5 h-5 text-muted-foreground mt-0.5 flex justify-center">
									₦
								</p>
								<div className="flex-1">
									<p className="text-sm text-muted-foreground">Gross Amount</p>
									<p className="font-medium text-lg">
										{formatAmount(gross, currency)}
									</p>
								</div>
							</div>

							<div className="flex items-start gap-4">
								<Briefcase className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<p className="text-sm text-muted-foreground">
										Platform Commission
									</p>
									<p className="font-medium text-destructive">
										-{formatAmount(commission, currency)}
									</p>
								</div>
							</div>

							<div className="flex items-start gap-4">
								<Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div className="flex-1">
									<p className="text-sm text-muted-foreground">
										Technician Net Amount
									</p>
									<p className="font-semibold text-green-700 text-lg">
										{formatAmount(net, currency)}
									</p>
								</div>
							</div>
						</div>

						<Separator />

						{/* Optional extra info */}
						{payout?.provider_operation_id && (
							<div className="p-4 bg-muted rounded-lg text-sm">
								<span className="text-muted-foreground">
									Provider Reference:{" "}
								</span>
								<span className="font-medium">
									{payout.provider_operation_id}
								</span>
							</div>
						)}

						<div className="p-4 bg-purple-50 rounded-lg">
							<p className="text-sm text-purple-900">
								<strong>Payout Schedule:</strong> Payouts are processed after
								approval and may take 1–2 business days.
							</p>
						</div>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
