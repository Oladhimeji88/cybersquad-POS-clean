import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

export function AddStoreModal({ open, onClose, storeToEdit, onSuccess }) {
  const { api } = useApi();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    country: "",
    phone: "",
    email: "",
    is_active: true
  });

  useEffect(() => {
    if (storeToEdit) {
      setFormData({
        name: storeToEdit.name || "",
        code: storeToEdit.code || "",
        address: storeToEdit.address || "",
        city: storeToEdit.city || "",
        state: storeToEdit.state || "",
        country: storeToEdit.country || "",
        phone: storeToEdit.phone || "",
        email: storeToEdit.email || "",
        is_active: storeToEdit.is_active ?? true
      });
    } else {
      setFormData({
        name: "", code: "", address: "", city: "", state: "", country: "", phone: "", email: "", is_active: true
      });
    }
  }, [storeToEdit, open]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (storeToEdit) {
        await api.patch(`/users/stores/${storeToEdit.id}/`, formData);
        toast.success("Store updated successfully");
      } else {
        await api.post("/users/stores/", formData);
        toast.success("Store created successfully");
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Store error:", error);
      toast.error(error?.response?.data?.message || `Failed to ${storeToEdit ? 'update' : 'create'} store`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{storeToEdit ? "Edit Store" : "Add Store"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Store Name*</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Store Code*</Label>
              <Input id="code" name="code" value={formData.code} onChange={handleChange} required />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" value={formData.address} onChange={handleChange} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" value={formData.city} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" value={formData.state} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" value={formData.country} onChange={handleChange} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {storeToEdit ? "Save Changes" : "Add Store"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
