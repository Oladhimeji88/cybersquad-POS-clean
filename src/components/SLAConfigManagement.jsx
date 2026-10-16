import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { SLAConfigEditorModal } from "./SLAConfigEditorModal";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  ensureStageRules,
  formatKeyLabel,
  formatSeconds,
  getScopeParts,
  getStageLabel,
  summarizeScope,
} from "../lib/slaConfig";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function ConfigStatusBadge({ config }) {
  if (config?.is_active) {
    return (
      <Badge
        style={{
          backgroundColor: "#16a34a",
          borderColor: "#16a34a",
          color: "#ffffff",
        }}
      >
        Active
      </Badge>
    );
  }

  return <Badge variant="outline">Inactive</Badge>;
}

function ScopeChips({ config, compact = false }) {
  const parts = getScopeParts(config);
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((part) => (
        <Badge
          key={part}
          variant="secondary"
          className={`rounded-md font-normal ${compact ? "text-[10px] px-2" : "text-xs"}`}
        >
          {part}
        </Badge>
      ))}
    </div>
  );
}

function StageRuleSummary({ stage, rule }) {
  const deadlineMode = rule?.deadline_mode || {};
  const reminders = Array.isArray(rule?.reminders) ? rule.reminders : [];
  const hasExtensions = Boolean(rule?.extensions?.allowed);
  const hasAdminExtensions = Boolean(rule?.admin_extensions?.allowed);
  const canReassign = Boolean(rule?.reassignment_eligible || rule?.reassign_on_overdue);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{getStageLabel(stage)}</p>
          <p className="text-xs text-slate-500 font-mono">{stage}</p>
        </div>
        {rule?.final_stage && (
          <Badge variant="outline" className="bg-slate-50">
            Final
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-slate-400">Deadline</p>
          <p className="font-medium text-slate-800">
            {formatKeyLabel(deadlineMode.type || "fixed_ttl")}
          </p>
          {"ttl_seconds" in deadlineMode && (
            <p>{formatSeconds(deadlineMode.ttl_seconds)}</p>
          )}
          {"default_ttl_seconds" in deadlineMode && (
            <p>Default {formatSeconds(deadlineMode.default_ttl_seconds)}</p>
          )}
        </div>
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-slate-400">Automation</p>
          <p>{reminders.length} reminder{reminders.length === 1 ? "" : "s"}</p>
          <p>{hasExtensions ? "Technician extensions" : "No technician extensions"}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {hasAdminExtensions && (
          <Badge variant="outline" className="text-[10px]">
            Admin extensions
          </Badge>
        )}
        {canReassign && (
          <Badge variant="outline" className="text-[10px]">
            Reassignment
          </Badge>
        )}
        {rule?.escalation_config && (
          <Badge variant="outline" className="text-[10px]">
            Escalation
          </Badge>
        )}
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-slate-100 p-4">
          <Clock className="h-6 w-6 text-slate-400" />
        </div>
        <div>
          <p className="font-medium text-slate-900">Select an SLA policy</p>
          <p className="text-sm text-slate-500">
            Review scope, version, stage rules, and activation status.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SLAConfigManagement() {
  const { api } = useApi();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 20,
    next: null,
    previous: null,
  });
  const [actionId, setActionId] = useState(null);
  const [editorState, setEditorState] = useState({
    open: false,
    mode: "create",
    config: null,
  });

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      const response = await api.get(`/sla/configs/?${params.toString()}`);
      const result = Array.isArray(response?.data?.result)
        ? response.data.result
        : [];

      setConfigs(result);
      setPagination(response?.data?.pagination || {});

      if (selectedConfig?.id) {
        const fresh = result.find((config) => config.id === selectedConfig.id);
        if (fresh) setSelectedConfig(fresh);
      }
    } catch (error) {
      console.error("Failed to load SLA configs:", error);
      toast.error(getErrorMessage(error, "Failed to load SLA policies"));
    } finally {
      setLoading(false);
    }
  }, [api, page, pageSize, selectedConfig?.id]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const filteredConfigs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return configs.filter((config) => {
      if (statusFilter === "active" && !config.is_active) return false;
      if (statusFilter === "inactive" && config.is_active) return false;
      if (!query) return true;

      return [
        config.name,
        config.service_type,
        config.source_channel,
        config.workflow_type,
        config.job_group_type,
        config.customer_city,
        config.region,
        summarizeScope(config),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [configs, searchQuery, statusFilter]);

  const selectConfig = async (config) => {
    setSelectedConfig(config);
    setDetailLoading(true);
    try {
      const response = await api.get(`/sla/configs/${config.id}/`);
      const detail = response?.data?.result || response?.data?.result?.config;
      setSelectedConfig(detail || config);
    } catch (error) {
      console.error("Failed to load SLA config detail:", error);
      toast.error(getErrorMessage(error, "Failed to load SLA policy details"));
    } finally {
      setDetailLoading(false);
    }
  };

  const activateConfig = async (config) => {
    setActionId(config.id);
    try {
      const response = await api.post(`/sla/configs/${config.id}/activate/`);
      toast.success(response?.data?.message || "SLA policy activated");
      await fetchConfigs();
      await selectConfig(response?.data?.result?.config || config);
    } catch (error) {
      console.error("Failed to activate SLA config:", error);
      toast.error(getErrorMessage(error, "Failed to activate SLA policy"));
    } finally {
      setActionId(null);
    }
  };

  const deactivateConfig = async (config) => {
    setActionId(config.id);
    try {
      const response = await api.patch(`/sla/configs/${config.id}/`, {
        is_active: false,
      });
      toast.success(response?.data?.message || "SLA policy deactivated");
      await fetchConfigs();
      await selectConfig(response?.data?.result?.config || { ...config, is_active: false });
    } catch (error) {
      console.error("Failed to deactivate SLA config:", error);
      toast.error(getErrorMessage(error, "Failed to deactivate SLA policy"));
    } finally {
      setActionId(null);
    }
  };

  const openEditor = (mode, config = null) => {
    setEditorState({ open: true, mode, config });
  };

  const closeEditor = () => {
    setEditorState((current) => ({ ...current, open: false }));
  };

  const handleEditorSaved = async (config) => {
    await fetchConfigs();
    if (config?.id) {
      await selectConfig(config);
    }
  };

  const stageRules = ensureStageRules(selectedConfig?.stage_rules);
  const stageOrder = stageRules.stage_order.length
    ? stageRules.stage_order
    : Object.keys(stageRules.stages);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
      <Card className="shadow-none border-slate-200 rounded-lg">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-base">SLA Policies</CardTitle>
              <CardDescription>
                Configure which SLA rule set applies to each job scope.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={fetchConfigs} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={() => openEditor("create")}>
                <Plus className="mr-2 h-4 w-4" />
                New Policy
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name, scope, workflow..."
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Policies</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead>Policy</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center">
                      <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading SLA policies...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredConfigs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                      No SLA policies found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConfigs.map((config) => (
                    <TableRow
                      key={config.id}
                      className={`cursor-pointer ${selectedConfig?.id === config.id ? "bg-purple-50/60" : ""}`}
                      onClick={() => selectConfig(config)}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-slate-900">
                            {config.name || "Untitled SLA"}
                          </div>
                          <div className="text-xs text-slate-500">
                            ID #{config.id} · v{config.version}
                            {config.is_default ? " · default" : ""}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <ScopeChips config={config} compact />
                      </TableCell>
                      <TableCell>
                        <ConfigStatusBadge config={config} />
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {formatDateTime(config.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {config.is_active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Deactivate"
                              disabled={actionId === config.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                deactivateConfig(config);
                              }}
                            >
                              {actionId === config.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PowerOff className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Activate"
                              disabled={actionId === config.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                activateConfig(config);
                              }}
                            >
                              {actionId === config.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title={config.is_active ? "Clone to edit" : "Edit draft"}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditor(config.is_active ? "clone" : "edit", config);
                            }}
                          >
                            {config.is_active ? (
                              <GitBranch className="h-4 w-4" />
                            ) : (
                              <Settings2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-500">
              Showing {filteredConfigs.length} of {pagination.count || configs.length} policies
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={!pagination.previous || page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Page {pagination.page || page} of {pagination.pages || 1}
              </span>
              <Button
                variant="outline"
                disabled={!pagination.next}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedConfig ? (
        <Card className="shadow-none border-slate-200 rounded-lg">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {selectedConfig.name || "Untitled SLA"}
                </CardTitle>
                <CardDescription>
                  Version {selectedConfig.version} · ID #{selectedConfig.id}
                </CardDescription>
              </div>
              <ConfigStatusBadge config={selectedConfig} />
            </div>

            <ScopeChips config={selectedConfig} />

            {selectedConfig.is_active ? (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Active policies are read-only. Clone this policy, edit the inactive draft,
                  then activate it when ready.
                </p>
              </div>
            ) : (
              <div className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>This inactive policy can be edited safely before activation.</p>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {detailLoading ? (
              <div className="flex h-[420px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-400">Default TTL</p>
                    <p className="font-medium">{formatSeconds(selectedConfig.default_ttl_seconds)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-400">Max reassignments</p>
                    <p className="font-medium">{selectedConfig.max_reassignments ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-400">Created</p>
                    <p className="font-medium text-sm">{formatDateTime(selectedConfig.created_at)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-400">Updated</p>
                    <p className="font-medium text-sm">{formatDateTime(selectedConfig.updated_at)}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">Stage Rules</p>
                    <p className="text-sm text-slate-500">
                      {stageOrder.length} configured stage{stageOrder.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      openEditor(
                        selectedConfig.is_active ? "clone" : "edit",
                        selectedConfig,
                      )
                    }
                  >
                    {selectedConfig.is_active ? (
                      <>
                        <GitBranch className="mr-2 h-4 w-4" />
                        Clone to Edit
                      </>
                    ) : (
                      <>
                        <Settings2 className="mr-2 h-4 w-4" />
                        Edit Draft
                      </>
                    )}
                  </Button>
                </div>

                <ScrollArea className="h-[500px] pr-4">
                  {stageOrder.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                      No stage rules configured for this policy.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {stageOrder.map((stage) => (
                        <StageRuleSummary
                          key={stage}
                          stage={stage}
                          rule={stageRules.stages?.[stage] || {}}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <EmptyDetail />
      )}

      <SLAConfigEditorModal
        open={editorState.open}
        mode={editorState.mode}
        sourceConfig={editorState.config}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
      />
    </div>
  );
}
