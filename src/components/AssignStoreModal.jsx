import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

export function AssignStoreModal({ open, onClose, onSuccess }) {
  const { api } = useApi();
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState([]);
  const [users, setUsers] = useState([]);

  const [formData, setFormData] = useState({
    user_id: "",
    store_id: "",
    is_primary: true
  });

  // Fetch users (Admins) and stores for the dropdowns
  useEffect(() => {
    if (open) {
      const fetchOptions = async () => {
        try {
          // get stores (unpaginated or large page size for select)
          const storesRes = await api.get("/users/stores/?page_size=100&is_active=true");
          setStores(storesRes?.data?.result || []);

          // get admins (assuming we can assign admins, tech, QA to stores. using admins list as proxy here)
          const usersRes = await api.get("/users/profile/admins/?page_size=100");
          setUsers(usersRes?.data?.result || []);
          
        } catch (error) {
          console.error("Failed to load options", error);
        }
      };
      
      fetchOptions();
      setFormData({ user_id: "", store_id: "", is_primary: true });
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.user_id || !formData.store_id) {
      toast.error("User and Store are required");
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch existing assignments
      const existingRes = await api.get("/users/store-assignments/?page_size=1000");
      const allAssignments = existingRes?.data?.result || [];

      // 2. Filter for assignments matching the selected user
      const userAssignments = allAssignments.filter(asgn => {
        const userId = typeof asgn.user === "object" && asgn.user !== null 
          ? String(asgn.user.id) 
          : String(asgn.user);
        return userId === String(formData.user_id);
      });

      // 3. Delete previous assignments for this user
      if (userAssignments.length > 0) {
        await Promise.all(
          userAssignments.map(asgn => api.delete(`/users/store-assignments/${asgn.id}/`))
        );
      }

      // 4. Create the new assignment
      await api.post("/users/store-assignments/", {
        user_id: Number(formData.user_id),
        store_id: Number(formData.store_id),
        is_primary: formData.is_primary
      });
      
      toast.success("User assigned to store successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Assignment error:", error);
      toast.error(error?.response?.data?.message || "Failed to assign user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Assign Staff to Store</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Select Staff Member</Label>
            <Select 
              value={formData.user_id} 
              onValueChange={(val) => setFormData(p => ({ ...p, user_id: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.first_name} {u.last_name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Select Store</Label>
            <Select 
              value={formData.store_id} 
              onValueChange={(val) => setFormData(p => ({ ...p, store_id: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select store..." />
              </SelectTrigger>
              <SelectContent>
                {stores.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="primary" className="font-semibold">Set as Primary Location</Label>
            <Switch
              id="primary"
              checked={formData.is_primary}
              onCheckedChange={(checked) => setFormData(p => ({ ...p, is_primary: checked }))}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
