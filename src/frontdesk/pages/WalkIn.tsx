import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TICKET_INTAKE_LABELS, TicketIntakeType } from "@/frontdesk/lib/store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";

const WALK_IN_TYPES: TicketIntakeType[] = [
  "post_warranty",
  "repeat_return",
  "warranty",
  "onsite",
];

const WALK_IN_DESCRIPTIONS: Record<TicketIntakeType, string> = {
  post_warranty: "Standard intake flow for repairs outside any active warranty cover.",
  repeat_return: "For customers returning within the 3-month repair warranty period.",
  warranty: "For Amo devices covered by the 1-year device warranty.",
  onsite: "Create a corporate or bulk parent job first, then add the individual child jobs under it.",
};

const WALK_IN_OPTION_LABELS: Record<TicketIntakeType, string> = {
  post_warranty: TICKET_INTAKE_LABELS.post_warranty,
  repeat_return: TICKET_INTAKE_LABELS.repeat_return,
  warranty: TICKET_INTAKE_LABELS.warranty,
  onsite: "Corporate / Bulk Jobs",
  corporate: TICKET_INTAKE_LABELS.corporate,
};

const isTicketIntakeType = (value: string): value is TicketIntakeType =>
  value === "post_warranty" ||
  value === "repeat_return" ||
  value === "warranty" ||
  value === "onsite";

export default function WalkIn() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<TicketIntakeType>("post_warranty");

  const handleContinue = () => {
    if (selectedType === "onsite") {
      navigate("/self-service");
      return;
    }

    navigate(`/new-ticket?intakeType=${selectedType}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Walk In</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the correct intake path before opening the job. Use Corporate / Bulk Jobs when you want a parent job with multiple child tickets.
        </p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Ticket Type</h2>
          <p className="text-sm text-muted-foreground">
            Select the job flow, then continue to the right page for that workflow.
          </p>
        </div>

        <Select
          value={selectedType}
          onValueChange={(value) => {
            if (isTicketIntakeType(value)) setSelectedType(value);
          }}
        >
          <SelectTrigger className="bg-secondary border-border">
            <SelectValue placeholder="Select ticket type" />
          </SelectTrigger>
          <SelectContent>
            {WALK_IN_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {WALK_IN_OPTION_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground">{WALK_IN_DESCRIPTIONS[selectedType]}</p>

        <Button onClick={handleContinue}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
