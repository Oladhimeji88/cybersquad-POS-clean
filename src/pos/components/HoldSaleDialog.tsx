import { useState } from "react";
import { PauseCircle } from "lucide-react";
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

interface HoldSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHold: (label: string) => void;
}

export default function HoldSaleDialog({ open, onOpenChange, onHold }: HoldSaleDialogProps) {
  const [label, setLabel] = useState("");

  const handleSubmit = () => {
    onHold(label.trim() || "Held Sale");
    setLabel("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" style={{ maxWidth: "24rem" }}>
        <DialogHeader className="items-center text-center">
          <PauseCircle className="w-10 h-10 text-primary" />
          <DialogTitle>Hold This Sale</DialogTitle>
          <DialogDescription>Give it a label so you can find it later (e.g. a customer name).</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="hold-label">Label</Label>
          <Input
            id="hold-label"
            placeholder="e.g. John, Table 3..."
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Hold Sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
