import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

import {
  Percent,
  Save,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Wrench,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";

import { useApi } from "../hooks/useApi";
import { useDeviceCategories } from "@/hooks/useDeviceCategories";
import { getDeviceCategoryLabel } from "@/lib/deviceCategories";
import { ServicePricesModal } from "./ServicePricesModal";
import { CreateServiceModal } from "./CreateServiceModal";
import { EditServiceModal } from "./EditServiceModal";
import { DeviceCategoriesPanel } from "./DeviceCategoriesPanel";
import { hasPrivilege } from "@/auth/privileges";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// Hide these from UI (as you requested)
const HIDDEN_SERVICE_CODES = new Set([
  "DONT-KNOW",
  "NOT-LISTED",
  "NOT-LISTED-LAPTOP",
  "NOT-LISTED-TABLET",
]);

function PaginationBar({
  page,
  pages,
  pageSize,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onPageSizeChange,
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev} disabled={!canPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{page}</span>{" "}
          <span className="text-muted-foreground">of</span>{" "}
          <span className="font-medium text-foreground">{pages || 1}</span>
        </div>

        <Button variant="outline" size="icon" onClick={onNext} disabled={!canNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm text-muted-foreground">Show</span>

        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="w-[95px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">entries</span>
      </div>
    </div>
  );
}

export function ServiceManagement() {
  const { api } = useApi();
  const {
    selectableCategories: selectableDeviceCategories,
    defaultCategoryName,
  } = useDeviceCategories();

  const canManageDeviceCategories = useMemo(
    () => hasPrivilege("privilege_lead_engineer_management"),
    [],
  );

  // Commission (leave as-is for now)
  const handleSaveCommissionRates = () => {
    toast.success("Commission rates saved successfully!");
  };

  // Services list (API)
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const [servicePage, setServicePage] = useState(1);
  const [servicePageSize, setServicePageSize] = useState(10);
  const [servicePagination, setServicePagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // UI state
  const [search, setSearch] = useState("");
  const [showServicePrices, setShowServicePrices] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const [showCreateService, setShowCreateService] = useState(false);

  const [showEditService, setShowEditService] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState(null);

  useEffect(() => {
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicePage, servicePageSize]);

  const fetchServices = async () => {
    setServicesLoading(true);
    try {
      const res = await api.get(`/jobs/services/?page=${servicePage}&page_size=${servicePageSize}`);
      const data = res?.data || {};

      const raw = Array.isArray(data.result) ? data.result : [];
      const filtered = raw.filter((s) => !HIDDEN_SERVICE_CODES.has(String(s?.code || "").toUpperCase()));

      setServices(filtered);
      setServicePagination(data.pagination || {});
    } catch (e) {
      console.error("Error fetching services:", e);
      toast.error("Failed to load services");
      setServices([]);
      setServicePagination({
        count: 0,
        pages: 1,
        page: servicePage,
        page_size: servicePageSize,
        next: null,
        previous: null,
      });
    } finally {
      setServicesLoading(false);
    }
  };

  const displayedServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;

    return services.filter((s) => {
      const name = String(s?.name || "").toLowerCase();
      const title = String(s?.title || "").toLowerCase();
      const code = String(s?.code || "").toLowerCase();
      const type = String(s?.service_type || "").toLowerCase();
      return name.includes(q) || title.includes(q) || code.includes(q) || type.includes(q);
    });
  }, [services, search]);

  const formatMoney = (amount) => {
    if (amount === null || amount === undefined || amount === "") return "-";
    const n = Number(amount);
    if (Number.isNaN(n)) return `₦${amount}`;
    return `₦${n.toLocaleString()}`;
  };

  const openManagePrices = (service) => {
    setSelectedService(service);
    setShowServicePrices(true);
  };

  const openEditService = (service) => {
    setServiceToEdit(service);
    setShowEditService(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Service Management</h1>
          <p className="text-muted-foreground">Configure services, pricing and overrides</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowCreateService(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Service
          </Button>
        </div>
      </div>

      {/* Commission Settings (kept as you had it) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Commission Settings
          </CardTitle>
          <CardDescription>Configure commission rates per service category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["Hardware", "Electrical", "Plumbing", "HVAC", "Carpentry", "Painting"].map((category) => (
              <div key={category} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label>{category}</Label>
                  <p className="text-xs text-muted-foreground">Service category commission rate</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" defaultValue="15" className="w-20" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}

            <Button className="w-full" onClick={handleSaveCommissionRates}>
              <Save className="w-4 h-4 mr-2" />
              Save Commission Rates
            </Button>
          </div>
        </CardContent>
      </Card>

      {canManageDeviceCategories && <DeviceCategoriesPanel />}

      {/* Services Pricing (NEW) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Service Pricing
              </CardTitle>
              <CardDescription>
                Manage base price + per-device overrides (brand/model pricing)
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Search services (name, code, type...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[280px]"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Overrides</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center ">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {servicesLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center">
                      <div className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading services...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : displayedServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No services found.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedServices.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium">{s?.name || s?.title || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {s?.code || "-"}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>{getDeviceCategoryLabel(s?.service_type)}</TableCell>

                      <TableCell>{formatMoney(s?.base_price)}</TableCell>

                      <TableCell>
                        <Badge variant="secondary">
                          {Number(s?.override_count || 0).toLocaleString()}
                        </Badge>
                      </TableCell>

                      <TableCell>{s?.sla_hours ? `${s.sla_hours} hrs` : "-"}</TableCell>

                      <TableCell>
                        {s?.is_active ? (
                          <Badge className="bg-green-600 text-white">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right whitespace-nowrap" style={{ width: "1px" }}>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditService(s)}
                            title="Edit service"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openManagePrices(s)}>
                            Manage Prices
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            page={servicePagination?.page || servicePage}
            pages={servicePagination?.pages || 1}
            pageSize={servicePageSize}
            canPrev={Boolean(servicePagination?.previous)}
            canNext={Boolean(servicePagination?.next)}
            onPrev={() => setServicePage((p) => Math.max(1, p - 1))}
            onNext={() => setServicePage((p) => p + 1)}
            onPageSizeChange={(n) => {
              setServicePageSize(n);
              setServicePage(1);
            }}
          />
        </CardContent>
      </Card>

      {/* Manage Overrides Modal */}
      <ServicePricesModal
        open={showServicePrices}
        onClose={() => {
          setShowServicePrices(false);
          setSelectedService(null);
        }}
        service={selectedService}
        onSaved={() => fetchServices()}
      />

      {/* Create Service Modal */}
      <CreateServiceModal
        open={showCreateService}
        onClose={() => setShowCreateService(false)}
        deviceCategories={selectableDeviceCategories}
        defaultCategoryName={defaultCategoryName}
        onCreated={() => {
          setShowCreateService(false);
          fetchServices();
        }}
      />

      {/* Edit Service Modal */}
      <EditServiceModal
        open={showEditService}
        onClose={() => {
          setShowEditService(false);
          setServiceToEdit(null);
        }}
        service={serviceToEdit}
        deviceCategories={selectableDeviceCategories}
        onSaved={(updated) => {
          if (updated?.id) {
            setServices((prev) =>
              prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
            );
          }
          fetchServices();
        }}
      />

    </div>
  );
}
