import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Store, Loader2, Plus, Edit2, Trash2, PowerOff, Power, Eye } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";
import { AddStoreModal } from "./AddStoreModal";
import { AssignStoreModal } from "./AssignStoreModal";
import { StoreDetailModal } from "./StoreDetailModal";

const PAGE_SIZE = 10;

export function StoreManagement() {
  const { api } = useApi();
  const [activeTab, setActiveTab] = useState("stores");

  // Stores State
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storePage, setStorePage] = useState(1);
  const [storePagination, setStorePagination] = useState({});
  const [showAddStore, setShowAddStore] = useState(false);
  const [storeToEdit, setStoreToEdit] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [showStoreDetail, setShowStoreDetail] = useState(false);

  // Assignments State
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [assignmentPagination, setAssignmentPagination] = useState({});
  const [showAssignStore, setShowAssignStore] = useState(false);

  // Fetch Stores
  const fetchStores = async () => {
    setStoresLoading(true);
    try {
      const res = await api.get(`/users/stores/?page=${storePage}&page_size=${PAGE_SIZE}`);
      setStores(res?.data?.result || []);
      setStorePagination(res?.data?.pagination || {});
    } catch (error) {
      toast.error("Failed to load stores");
    } finally {
      setStoresLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "stores") fetchStores();
  }, [storePage, activeTab]);

  // Fetch Assignments
  const fetchAssignments = async () => {
    setAssignmentsLoading(true);
    try {
      const res = await api.get(`/users/store-assignments/?page=${assignmentPage}&page_size=${PAGE_SIZE}`);
      setAssignments(res?.data?.result || []);
      setAssignmentPagination(res?.data?.pagination || {});
    } catch (error) {
      toast.error("Failed to load store assignments");
    } finally {
      setAssignmentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "assignments") fetchAssignments();
  }, [assignmentPage, activeTab]);

  const handleToggleStoreStatus = async (store) => {
    const isDeactivating = store.is_active;
    const confirmMessage = isDeactivating
      ? `Are you sure you want to deactivate ${store.name}?`
      : `Are you sure you want to reactivate ${store.name}?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      if (isDeactivating) {
        await api.delete(`/users/stores/${store.id}/`);
        toast.success("Store deactivated successfully");
      } else {
        await api.patch(`/users/stores/${store.id}/reactivate/`);
        toast.success("Store reactivated successfully");
      }
      fetchStores();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to change store status");
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    if (!window.confirm("Are you sure you want to remove this assignment?")) return;

    try {
      await api.delete(`/users/store-assignments/${assignmentId}/`);
      toast.success("Assignment removed successfully");
      fetchAssignments();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to remove assignment");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Store Management</h1>
        <p className="text-muted-foreground">Manage service centers and staff assignments</p>
      </div>

      <div className="flex gap-4 border-b pb-2">
        <Button
          variant={activeTab === "stores" ? "default" : "ghost"}
          onClick={() => setActiveTab("stores")}
        >
          Stores
        </Button>
        <Button
          variant={activeTab === "assignments" ? "default" : "ghost"}
          onClick={() => setActiveTab("assignments")}
        >
          Store Assignments
        </Button>
      </div>

      {activeTab === "stores" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="w-5 h-5" />
                Stores
              </CardTitle>
              <CardDescription>Manage your physical locations</CardDescription>
            </div>
            <Button onClick={() => { setStoreToEdit(null); setShowAddStore(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Store
            </Button>
          </CardHeader>
          <CardContent>
            {storesLoading ? (
               <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.map(store => (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">{store.code}</TableCell>
                        <TableCell>{store.name}</TableCell>
                        <TableCell>{store.city}, {store.country}</TableCell>
                        <TableCell>
                          <Badge variant={store.is_active ? "default" : "secondary"}>
                            {store.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedStore(store); setShowStoreDetail(true); }} title="View store details">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setStoreToEdit(store); setShowAddStore(true); }}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleToggleStoreStatus(store)} title={store.is_active ? "Deactivate" : "Reactivate"}>
                            {store.is_active ? <PowerOff className="w-4 h-4 text-destructive" /> : <Power className="w-4 h-4 text-green-500" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {stores.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-8">No stores found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                
                <div className="flex justify-between items-center text-sm text-muted-foreground pt-4">
                  <div>Page {storePage} of {storePagination.pages || 1}</div>
                  <div className="space-x-2">
                    <Button variant="outline" size="sm" disabled={!storePagination.previous} onClick={() => setStorePage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={!storePagination.next} onClick={() => setStorePage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "assignments" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="w-5 h-5" />
                Staff Assignments
              </CardTitle>
              <CardDescription>Assign staff to specific stores</CardDescription>
            </div>
            <Button onClick={() => setShowAssignStore(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Assign User
            </Button>
          </CardHeader>
          <CardContent>
            {assignmentsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map(asgn => (
                      <TableRow key={asgn.id}>
                        <TableCell className="font-medium">
                          {asgn.user_name ? asgn.user_name : typeof asgn.user === "object" && asgn.user !== null 
                            ? `${asgn.user.first_name || ""} ${asgn.user.last_name || ""} (${asgn.user.email || "User " + asgn.user.id})`
                            : `User ${asgn.user}`}
                        </TableCell>
                        <TableCell>
                          {typeof asgn.store === "object" && asgn.store !== null
                            ? `${asgn.store.name} (${asgn.store.code})`
                            : asgn.store}
                        </TableCell>
                        <TableCell>
                          {asgn.is_primary ? <Badge>Primary</Badge> : <span className="text-muted-foreground mx-2">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveAssignment(asgn.id)} title="Remove Assignment">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {assignments.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-8">No assignments found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>

                <div className="flex justify-between items-center text-sm text-muted-foreground pt-4">
                  <div>Page {assignmentPage} of {assignmentPagination.pages || 1}</div>
                  <div className="space-x-2">
                    <Button variant="outline" size="sm" disabled={!assignmentPagination.previous} onClick={() => setAssignmentPage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={!assignmentPagination.next} onClick={() => setAssignmentPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showAddStore && (
        <AddStoreModal 
          open={showAddStore} 
          onClose={() => { setShowAddStore(false); setStoreToEdit(null); }} 
          storeToEdit={storeToEdit}
          onSuccess={fetchStores} 
        />
      )}
      {showAssignStore && (
        <AssignStoreModal
          open={showAssignStore}
          onClose={() => setShowAssignStore(false)}
          onSuccess={fetchAssignments}
        />
      )}
      {showStoreDetail && selectedStore && (
        <StoreDetailModal
          open={showStoreDetail}
          onOpenChange={(v) => { setShowStoreDetail(v); if (!v) setSelectedStore(null); }}
          store={selectedStore}
        />
      )}
    </div>
  );
}
