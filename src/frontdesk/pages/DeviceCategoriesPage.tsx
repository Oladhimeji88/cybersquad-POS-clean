import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Tag } from "lucide-react";
import { DeviceCategoriesPanel } from "@/components/DeviceCategoriesPanel";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPrivilege } from "@/auth/privileges";

export default function DeviceCategoriesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    setAllowed(hasPrivilege("privilege_lead_engineer_management"));
  }, []);

  if (allowed === null) return null;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Device Categories
          </CardTitle>
          <CardDescription>
            Manage the device categories used across intake, repair, and reporting workflows.
          </CardDescription>
        </CardHeader>
      </Card>

      <DeviceCategoriesPanel />
    </div>
  );
}
