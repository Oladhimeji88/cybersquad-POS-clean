import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Calendar } from "./ui/calendar";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";

// Source channel supports selecting multiple values (sent comma-separated)
const SOURCE_CHANNEL_OPTIONS = [
  { value: "walk_in", label: "Walk-in" },
  { value: "corporate", label: "Corporate" },
  { value: "self_service", label: "Self-service" },
];

// Workflow type is single-select (the API does not accept comma-separated values)
const WORKFLOW_TYPE_OPTIONS = [
  { value: "warranty_repair", label: "Warranty Repair" },
  { value: "store_repair", label: "Store Repair" },
  { value: "corporate_repair", label: "Corporate Repair" },
  { value: "remote_repair", label: "Remote Repair" },
];

export function FilterModal({ open, onClose, type, initialFilters, onApply }) {
  const [filters, setFilters] = useState({});
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);

  useEffect(() => {
    // Load current filters ONLY when modal opens (not when initialFilters changes)
    if (open) {
      setFilters(initialFilters || {});
      setDateFrom(initialFilters?.dateFrom || null);
      setDateTo(initialFilters?.dateTo || null);
    }
  }, [open]); // Remove initialFilters from dependencies

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Source channel is a multi-select stored as a comma-separated string
  const selectedSourceChannels = (filters.source_channel || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const toggleSourceChannel = (value) => {
    setFilters((prev) => {
      const selected = (prev.source_channel || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      return { ...prev, source_channel: next.join(",") };
    });
  };

  const handleReset = () => {
    if (type === "payment") {
      setFilters({ status: "all", type: "all", minAmount: "all", maxAmount: "all" });
    } else if (type === "payout") {
      setFilters({ state: "all", minAmount: "all", maxAmount: "all" });
    } else if (type === "dispute") {
      setFilters({ status: "all", type: "all" });
    } else if (type === "job") {
      setFilters({
        status: "all",
        service_type: "all",
        source_channel: "",
        workflow_type: "all",
        tabType: filters.tabType, // Preserve the tab type
      });
    } else if (type === "sla") {
      setFilters({ type: "all", stage: "all", sla_status: "all" });
    } else {
      setFilters({});
    }
    setDateFrom(null);
    setDateTo(null);
  };

  const handleApplyFilters = () => {
    const payload = { ...filters, dateFrom, dateTo };
    onApply?.(payload);
    onClose?.();
  };

  // Get stage options based on tab type for jobs
  const getJobStageOptions = () => {
    const tabType = filters.tabType;

    if (tabType === "pending") {
      return [
        { value: "pending", label: "Pending" },
        { value: "offers_sent", label: "Offers Sent" },
        { value: "offer_confirmed", label: "Offer Confirmed" },
      ];
    } else if (tabType === "active") {
      return [
        { value: "awaiting_shipping_fee", label: "Awaiting Shipping Fee" },
        { value: "ready_to_schedule", label: "Ready to Schedule" },
        { value: "pickup_scheduled", label: "Pickup Scheduled" },
        { value: "technician_en_route", label: "En Route" },
        { value: "technician_arrived", label: "Arrived" },
        { value: "picked_up", label: "Picked Up" },
        { value: "diagnosing", label: "Diagnosing" },
        { value: "quote_sent", label: "Quote Sent" },
        { value: "quote_accepted", label: "Quote Accepted" },
        { value: "awaiting_service_fee", label: "Awaiting Service Fee" },
        { value: "service_fee_paid", label: "Service Fee Paid" },
        { value: "awaiting_parts_release", label: "Awaiting Parts" },
        { value: "ready_for_repair", label: "Ready for Repair" },
        { value: "repairing", label: "Repairing" },
        { value: "repair_in_progress", label: "Repair in Progress" },
        { value: "repaired", label: "Repaired" },
        { value: "submitted_for_qc_review", label: "Submitted for QC Review" },
        { value: "quality_check", label: "Quality Check" },
        { value: "qc_passed", label: "QC Passed" },
      ];
    } else if (tabType === "completed") {
      return [
        { value: "delivered", label: "Delivered" },
        { value: "ready_for_collection", label: "Ready for Collection" },
        { value: "ready_for_handover", label: "Ready for Handover" },
        { value: "closed", label: "Closed" },
      ];
    } else if (tabType === "cancelled") {
      return [
        { value: "cancelled", label: "Cancelled" },
        { value: "quote_rejected", label: "Quote Rejected" },
      ];
    }

    return [];
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Filter{" "}
            {type === "payment"
              ? "Payments"
              : type === "payout"
                ? "Payouts"
                : type === "dispute"
                  ? "Disputes"
                  : type === "job"
                    ? "Jobs"
                    : type === "sla"
                      ? "SLA Jobs"
                      : "Items"}
          </DialogTitle>
          <DialogDescription>
            Apply filters to narrow down your results
          </DialogDescription>
        </DialogHeader>

        <style>{`
          .filter-scroll::-webkit-scrollbar { width: 4px; }
          .filter-scroll::-webkit-scrollbar-track { background: transparent; }
          .filter-scroll::-webkit-scrollbar-thumb { background-color: var(--border); border-radius: 9999px; }
        `}</style>
        <div
          className="filter-scroll space-y-4 py-2 overflow-y-auto max-h-[60vh] pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
        >
          {type === "sla" && (
            <>
              <div className="space-y-2">
                <Label>Service Type</Label>
                <Select
                  value={filters.type || "all"}
                  onValueChange={(v) => handleFilterChange("type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Job Stage</Label>
                <Select
                  value={filters.stage || "all"}
                  onValueChange={(v) => handleFilterChange("stage", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="offers_sent">Offers Sent</SelectItem>
                    <SelectItem value="offer_confirmed">
                      Offer Confirmed
                    </SelectItem>
                    <SelectItem value="awaiting_shipping_fee">
                      Awaiting Shipping Fee
                    </SelectItem>
                    <SelectItem value="ready_to_schedule">
                      Ready to Schedule
                    </SelectItem>
                    <SelectItem value="pickup_scheduled">
                      Pickup Scheduled
                    </SelectItem>
                    <SelectItem value="technician_en_route">
                      En Route
                    </SelectItem>
                    <SelectItem value="technician_arrived">Arrived</SelectItem>
                    <SelectItem value="picked_up">Picked Up</SelectItem>
                    <SelectItem value="diagnosing">Diagnosing</SelectItem>
                    <SelectItem value="quote_sent">Quote Sent</SelectItem>
                    <SelectItem value="quote_accepted">
                      Quote Accepted
                    </SelectItem>
                    <SelectItem value="awaiting_service_fee">
                      Awaiting Service Fee
                    </SelectItem>
                    <SelectItem value="service_fee_paid">
                      Service Fee Paid
                    </SelectItem>
                    <SelectItem value="repair_in_progress">
                      Repair in Progress
                    </SelectItem>
                    <SelectItem value="repaired">Repaired</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>SLA Status</Label>
                <Select
                  value={filters.sla_status || "all"}
                  onValueChange={(v) => handleFilterChange("sla_status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="on_track">On Track</SelectItem>
                    <SelectItem value="at_risk">At Risk</SelectItem>
                    <SelectItem value="breached">Breached</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "job" && (
            <>
              <div className="space-y-2">
                <Label>Job Stage</Label>
                <Select
                  value={filters.status || "all"}
                  onValueChange={(v) => handleFilterChange("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {getJobStageOptions().map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Service Type</Label>
                <Select
                  value={filters.service_type || "all"}
                  onValueChange={(v) => handleFilterChange("service_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Source Channel</Label>
                <p className="text-xs text-muted-foreground">
                  Select one or more channels
                </p>
                <div className="space-y-2 rounded-md border border-border p-4">
                  {SOURCE_CHANNEL_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      className="flex items-center gap-2"
                    >
                      <Checkbox
                        id={`source-channel-${option.value}`}
                        checked={selectedSourceChannels.includes(option.value)}
                        onCheckedChange={() =>
                          toggleSourceChannel(option.value)
                        }
                      />
                      <Label
                        htmlFor={`source-channel-${option.value}`}
                        className="font-normal cursor-pointer"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Workflow Type</Label>
                <Select
                  value={filters.workflow_type || "all"}
                  onValueChange={(v) => handleFilterChange("workflow_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All workflows" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Workflows</SelectItem>
                    {WORKFLOW_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "payment" && (
            <>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={filters.status || "all"}
                  onValueChange={(v) => handleFilterChange("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="initiated">Initiated</SelectItem>
                    <SelectItem value="succeeded">Succeeded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Type</Label>
                <Select
                  value={filters.type || "all"}
                  onValueChange={(v) => handleFilterChange("type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="shipping_fee">Shipping Fee</SelectItem>
                    <SelectItem value="service_fee">Service Fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Minimum Amount (₦)</Label>
                <Select
                  value={filters.minAmount || "all"}
                  onValueChange={(v) => handleFilterChange("minAmount", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Amount</SelectItem>
                    <SelectItem value="5000">₦5,000+</SelectItem>
                    <SelectItem value="10000">₦10,000+</SelectItem>
                    <SelectItem value="50000">₦50,000+</SelectItem>
                    <SelectItem value="100000">₦100,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Maximum Amount (₦)</Label>
                <Select
                  value={filters.maxAmount || "all"}
                  onValueChange={(v) => handleFilterChange("maxAmount", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Amount</SelectItem>
                    <SelectItem value="5000">Up to ₦5,000</SelectItem>
                    <SelectItem value="10000">Up to ₦10,000</SelectItem>
                    <SelectItem value="50000">Up to ₦50,000</SelectItem>
                    <SelectItem value="100000">Up to ₦100,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "payout" && (
            <>
              <div className="space-y-2">
                <Label>State</Label>
                <Select
                  value={filters.state || "all"}
                  onValueChange={(v) => handleFilterChange("state", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    <SelectItem value="READY_FOR_APPROVAL">
                      Ready for Approval
                    </SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="PROCESSING">Processing</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Minimum Amount (₦)</Label>
                <Select
                  value={filters.minAmount || "all"}
                  onValueChange={(v) => handleFilterChange("minAmount", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Amount</SelectItem>
                    <SelectItem value="5000">₦5,000+</SelectItem>
                    <SelectItem value="10000">₦10,000+</SelectItem>
                    <SelectItem value="50000">₦50,000+</SelectItem>
                    <SelectItem value="100000">₦100,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Maximum Amount (₦)</Label>
                <Select
                  value={filters.maxAmount || "all"}
                  onValueChange={(v) => handleFilterChange("maxAmount", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any amount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Amount</SelectItem>
                    <SelectItem value="5000">Up to ₦5,000</SelectItem>
                    <SelectItem value="10000">Up to ₦10,000</SelectItem>
                    <SelectItem value="50000">Up to ₦50,000</SelectItem>
                    <SelectItem value="100000">Up to ₦100,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "dispute" && (
            <>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={filters.status || "all"}
                  onValueChange={(v) => handleFilterChange("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="created">Created</SelectItem>
                    <SelectItem value="awaiting_staff_assignment">
                      Awaiting Staff Assignment
                    </SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="awaiting_customer">
                      Awaiting Customer
                    </SelectItem>
                    <SelectItem value="awaiting_technician">
                      Awaiting Technician
                    </SelectItem>
                    <SelectItem value="judgement">Judgement</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dispute Type</Label>
                <Select
                  value={filters.type || "all"}
                  onValueChange={(v) => handleFilterChange("type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="booking_issue">Booking Issue</SelectItem>
                    <SelectItem value="payment_issue">Payment Issue</SelectItem>
                    <SelectItem value="service_quality">
                      Service Quality
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left h-10"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {dateFrom
                        ? dateFrom.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "From date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0"
                  align="start"
                  sideOffset={4}
                  collisionPadding={20}
                  style={{ zIndex: 9999 }}
                >
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => {
                      setDateFrom(date);
                      if (dateTo && date && date > dateTo) setDateTo(null);
                    }}
                    initialFocus
                    className="rounded-md border"
                  />
                </PopoverContent>
              </Popover>

              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left h-10"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {dateTo
                        ? dateTo.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "To date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0"
                  align="start"
                  sideOffset={4}
                  collisionPadding={20}
                  style={{ zIndex: 9999 }}
                >
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    disabled={(date) => (dateFrom ? date < dateFrom : false)}
                    initialFocus
                    className="rounded-md border"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4 border-t border-border mt-4">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex-1 sm:flex-none"
          >
            Reset
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApplyFilters}
            className="flex-1 sm:flex-none bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Apply Filters
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
