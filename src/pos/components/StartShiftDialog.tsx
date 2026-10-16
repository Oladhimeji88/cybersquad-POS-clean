import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StartShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (openingFloat: number) => Promise<void> | void;
}

export default function StartShiftDialog({ open, onOpenChange, onStart }: StartShiftDialogProps) {
  const [openingFloat, setOpeningFloat] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const value = Number(openingFloat);
    if (!openingFloat || Number.isNaN(value) || value < 0) return;
    setSubmitting(true);
    try {
      await onStart(value);
      setOpeningFloat("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Inline style guards against .frontdesk-theme's frozen legacy stylesheet,
          whose higher-specificity ".max-w-lg" rule can silently beat plain
          "sm:max-w-*" utility classes on pages under that theme (e.g. POS). */}
      <DialogContent className="sm:max-w-sm" style={{ maxWidth: "24rem" }}>
        <DialogHeader className="items-center text-center">
          <Wallet className="w-10 h-10 text-primary" />
          <DialogTitle>Start Your Shift</DialogTitle>
          <DialogDescription>Count the cash in the drawer and enter the opening float to begin.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="opening-float">Opening Float</Label>
          <Input
            id="opening-float"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="0"
            autoFocus
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!openingFloat || submitting} onClick={handleSubmit}>
            {submitting ? "Starting..." : "Start Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
