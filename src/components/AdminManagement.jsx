import { useEffect, useMemo, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";

import {
	Users,
	Shield,
	Save,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Trash2,
	Plus,
} from "lucide-react";
import { toast } from "sonner";

import { useApi } from "../hooks/useApi";

import { AddAdminModal } from "./AddAdminModal";
import { EditAdminModal } from "./EditAdminModal";
import { ServicePricesModal } from "./ServicePricesModal";
import { RevokeSessionModal } from "./RevokeSessionModal";
import { CreateRoleModal } from "./CreateRoleModal";
import { AddWalkinTechnicianModal } from "./AddWalkinTechnicianModal";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// UI label -> API field mapping (exactly what your backend expects)
const PERMISSION_FIELD_MAP = {
	Dashboard: "privilege_dashboard",
	"User Management": "privilege_user_management",
	"Job Management": "privilege_job_management",
	"Front Desk Management": "privilege_front_desk_management",
	"Lead Engineer Management": "privilege_lead_engineer_management",
	"Inventory Management": "privilege_inventory_management",
	"Payment & Finance": "privilege_payments_finance",
	"Can Approve Payouts": "can_approve_payouts",
	"Dispute Management": "privilege_dispute_management",
	"Reports & Analytics": "privilege_reports_analytics",
	"POS / Sales": "privilege_pos",
	"System Settings": "privilege_system_settings",
	"Backup Operator": "privilege_backup_operator",
	"Backup Approver": "privilege_backup_approver",
	"Backup Force Restore": "privilege_backup_force_restore",
	"Backup Lock Admin": "privilege_backup_lock_admin",
};

// permissions_level -> roleId fallback (in case admin_assignments is missing)
const PERMISSIONS_LEVEL_TO_ROLE_ID = {
	super_admin: 1,
	admin: 2,
	support_admin: 3,
};

// Small reusable pagination bar (same structure as your User Management)
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
				<Button
					variant="outline"
					size="icon"
					onClick={onPrev}
					disabled={!canPrev}
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>

				<div className="text-sm text-muted-foreground">
					Page <span className="font-medium text-foreground">{page}</span>{" "}
					<span className="text-muted-foreground">of</span>{" "}
					<span className="font-medium text-foreground">{pages || 1}</span>
				</div>

				<Button
					variant="outline"
					size="icon"
					onClick={onNext}
					disabled={!canNext}
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex items-center gap-2 justify-end">
				<span className="text-sm text-muted-foreground">Show</span>

				<Select
					value={String(pageSize)}
					onValueChange={(v) => onPageSizeChange(Number(v))}
				>
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

export function AdminManagement() {
	const { api } = useApi();

	// modals
	const [showAddAdmin, setShowAddAdmin] = useState(false);
	const [showEditAdmin, setShowEditAdmin] = useState(false);
	const [showServicePrices, setShowServicePrices] = useState(false);
	const [showRevokeSession, setShowRevokeSession] = useState(false);
	const [showCreateRole, setShowCreateRole] = useState(false);
	const [showWalkinModal, setShowWalkinModal] = useState(false);

	// selection
	const [selectedAdmin, setSelectedAdmin] = useState(null);
	const [selectedSession, setSelectedSession] = useState(null);

	// roles (from /platform/admin-roles/)
	const [roles, setRoles] = useState([]);
	const [rolesLoading, setRolesLoading] = useState(false);

	// role permissions panel selection -> store roleId as string ("1", "2", "3")
	const [selectedRoleId, setSelectedRoleId] = useState("1");

	// permissions UI state (switches)
	const [permissions, setPermissions] = useState({
		Dashboard: false,
		"User Management": false,
		"Job Management": false,
		"Front Desk Management": false,
		"Lead Engineer Management": false,
		"Inventory Management": false,
		"Payment & Finance": false,
		"Can Approve Payouts": false,
		"Dispute Management": false,
		"Reports & Analytics": false,
		"POS / Sales": false,
		"System Settings": false,
		"Backup Operator": false,
		"Backup Approver": false,
		"Backup Force Restore": false,
		"Backup Lock Admin": false,
	});

	// admins list + pagination
	const [admins, setAdmins] = useState([]);
	const [adminsLoading, setAdminsLoading] = useState(false);

	const [adminPage, setAdminPage] = useState(1);
	const [adminPageSize, setAdminPageSize] = useState(10);
	const [adminPagination, setAdminPagination] = useState({
		count: 0,
		pages: 1,
		page: 1,
		page_size: 10,
		next: null,
		previous: null,
	});

	const [adminsRefreshKey, setAdminsRefreshKey] = useState(0);

	const refreshAdmins = () => setAdminsRefreshKey((k) => k + 1);

	// current selected role object (for quick use)
	const selectedRoleObj = useMemo(() => {
		return roles.find((r) => String(r.id) === String(selectedRoleId)) || null;
	}, [roles, selectedRoleId]);

	// helper: build display name
	const getAdminDisplayName = (u) => {
		const first = u?.first_name || "";
		const last = u?.last_name || "";
		const combined = `${first} ${last}`.trim();
		if (combined) return combined;

		const fullName = u?.profile?.full_name?.trim();
		if (fullName) return fullName;

		return "—";
	};

	// helper: resolve roleId + roleName for an admin
	const resolveAdminRoleFromDetail = (detail) => {
		const assignments = Array.isArray(detail?.admin_assignments)
			? detail.admin_assignments
			: [];
		const activeAssignment =
			assignments.find((a) => a?.active) || assignments[0] || null;

		const roleIdFromAssignment = activeAssignment?.role?.id
			? Number(activeAssignment.role.id)
			: null;
		const assignmentId = activeAssignment?.id
			? Number(activeAssignment.id)
			: null;
		const roleNameFromAssignment = activeAssignment?.role?.name || null;

		if (roleIdFromAssignment) {
			return {
				roleId: roleIdFromAssignment,
				roleName: roleNameFromAssignment,
				assignmentId,
			};
		}

		// fallback to profile.permissions_level
		const level = detail?.profile?.permissions_level;
		const fallbackRoleId = PERMISSIONS_LEVEL_TO_ROLE_ID[level] || null;
		const fallbackRoleName =
			roles.find((r) => Number(r.id) === Number(fallbackRoleId))?.name ||
			(level ? level.replaceAll("_", " ") : "—");

		return {
			roleId: fallbackRoleId,
			roleName: fallbackRoleName,
			assignmentId: null,
		};
	};

	const fetchRoles = async () => {
		setRolesLoading(true);
		try {
			const res = await api.get("/platform/admin-roles/");
			const data = res?.data || {};
			let list = Array.isArray(data.result) ? data.result : [];

			// Filter for only active roles
			list = list.filter((r) => r.active === true || r.is_active === true);

			// Sort by id to keep order stable (1,2,3)
			list.sort((a, b) => Number(a.id) - Number(b.id));
			setRoles(list);

			// default selected role id to 1 if it exists and current selected is invalid
			if (!list.find((r) => String(r.id) === selectedRoleId)) {
				if (list.some((r) => String(r.id) === "1")) {
					setSelectedRoleId("1");
				} else if (list[0]?.id) {
					setSelectedRoleId(String(list[0].id));
				}
			}
		} catch (e) {
			console.error("Error fetching roles:", e);
			toast.error("Failed to load admin roles");
			setRoles([]);
		} finally {
			setRolesLoading(false);
		}
	};

	// 1) Fetch roles once (or refresh if needed)
	useEffect(() => {
		fetchRoles();
	}, []);

	// 2) When selectedRoleId changes (and roles are loaded), set switches to match that role
	useEffect(() => {
		if (!selectedRoleObj) return;

		const nextPermissions = {};
		Object.keys(PERMISSION_FIELD_MAP).forEach((uiLabel) => {
			const apiField = PERMISSION_FIELD_MAP[uiLabel];
			nextPermissions[uiLabel] = Boolean(selectedRoleObj?.[apiField]);
		});

		setPermissions((prev) => ({
			...prev,
			...nextPermissions,
		}));
	}, [selectedRoleObj]);

	// 3) Fetch admins (paginated) + enrich each admin by fetching detail (so we can show role + assignmentId)
	useEffect(() => {
		const fetchAdmins = async () => {
			setAdminsLoading(true);
			try {
				const res = await api.get(
					`/users/profile/admins/?page=${adminPage}&page_size=${adminPageSize}`,
				);
				const data = res?.data || {};

				const list = Array.isArray(data.result) ? data.result : [];
				const pagination = data.pagination || {};

				setAdminPagination(pagination);

				// fetch each admin detail to get admin_assignments (role + assignment id)
				const detailed = await Promise.allSettled(
					list.map(async (u) => {
						try {
							const detailRes = await api.get(`/users/profile/admins/${u.id}/`);
							const detailData =
								detailRes?.data?.result || detailRes?.data || {};
							const roleInfo = resolveAdminRoleFromDetail(detailData);

							return {
								...u,
								displayName: getAdminDisplayName(u),
								status: u?.is_active ? "active" : "inactive",
								roleId: roleInfo.roleId,
								roleName: roleInfo.roleName || "—",
								assignmentId: roleInfo.assignmentId,
							};
						} catch (err) {
							// fallback with only list info
							const level = u?.profile?.permissions_level;
							const fallbackRoleId =
								PERMISSIONS_LEVEL_TO_ROLE_ID[level] || null;
							const fallbackRoleName =
								roles.find((r) => Number(r.id) === Number(fallbackRoleId))
									?.name || (level ? level.replaceAll("_", " ") : "—");

							return {
								...u,
								displayName: getAdminDisplayName(u),
								status: u?.is_active ? "active" : "inactive",
								roleId: fallbackRoleId,
								roleName: fallbackRoleName,
								assignmentId: null,
							};
						}
					}),
				);

				const normalized = detailed.map((p, idx) => {
					if (p.status === "fulfilled") return p.value;

					// hard fallback if promise failed
					const u = list[idx];
					return {
						...u,
						displayName: getAdminDisplayName(u),
						status: u?.is_active ? "active" : "inactive",
						roleId: null,
						roleName: "—",
						assignmentId: null,
					};
				});

				setAdmins(normalized);
			} catch (e) {
				console.error("Error fetching admins:", e);
				toast.error("Failed to load admins");

				setAdmins([]);
				setAdminPagination({
					count: 0,
					pages: 1,
					page: adminPage,
					page_size: adminPageSize,
					next: null,
					previous: null,
				});
			} finally {
				setAdminsLoading(false);
			}
		};

		fetchAdmins();
		// NOTE: roles used only for fallback names; safe to include
	}, [adminPage, adminPageSize, roles, adminsRefreshKey]);

	const handleEditAdmin = (admin) => {
		setSelectedAdmin(admin);
		setShowEditAdmin(true);
	};

	const handleRevokeSession = (session) => {
		setSelectedSession(session);
		setShowRevokeSession(true);
	};

	const togglePermission = (permissionLabel) => {
		setPermissions((prev) => ({
			...prev,
			[permissionLabel]: !prev[permissionLabel],
		}));
	};

	const handleSavePermissions = async () => {
		const roleId = Number(selectedRoleId);
		if (!roleId) return;

		const payload = {};
		Object.entries(PERMISSION_FIELD_MAP).forEach(([uiLabel, apiField]) => {
			payload[apiField] = Boolean(permissions[uiLabel]);
		});

		try {
			const res = await api.patch(`/platform/admin-roles/${roleId}/`, payload);
			const updated = res?.data?.result || res?.data || null;

			toast.success("Role permissions updated");

			// ALWAYS update roles in memory (so switches reflect latest immediately)
			if (updated?.id) {
				// Backend returned the updated role - use it
				setRoles((prev) =>
					prev.map((r) =>
						Number(r.id) === Number(updated.id) ? { ...r, ...updated } : r,
					),
				);
			} else {
				// Backend didn't return updated role - manually merge our payload
				setRoles((prev) =>
					prev.map((r) => (Number(r.id) === roleId ? { ...r, ...payload } : r)),
				);
			}
		} catch (e) {
			console.error("Save permissions failed:", e);
			toast.error("Failed to update role permissions");
		}
	};

	const handleDeleteRole = async () => {
		const roleId = Number(selectedRoleId);
		if (!roleId) return;

		if (!window.confirm(`Are you sure you want to delete the role ${selectedRoleObj?.name}?`)) {
			return;
		}

		try {
			await api.delete(`/platform/admin-roles/${roleId}/?force=true`);
			toast.success("Role deleted successfully");
			// Default to ID 1 or reset to null first, then fetch roles
			setSelectedRoleId("1"); 
			fetchRoles();
		} catch (error) {
			console.error("Error deleting role:", error);
			toast.error(error?.response?.data?.message || "Failed to delete role");
		}
	};

	const activeSessions = [
		{
			admin: "VIVIAN",
			device: "Safari on MacOS",
			location: "Abuja, Nigeria",
			isCurrent: false,
		},
		{
			admin: "VIVIAN",
			device: "Firefox on Ubuntu",
			location: "Port Harcourt, Nigeria",
			isCurrent: false,
		},
	];

	return (
		<div className="space-y-6">
			<div>
				<h1>Admin Management</h1>
				<p className="text-muted-foreground">
					Manage admin users, roles, and security settings
				</p>
			</div>

			{/* Admin List */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<Users className="w-5 h-5" />
								Admin Roles & Permissions
							</CardTitle>
							<CardDescription>
								Manage admin user access and permissions
							</CardDescription>
						</div>
						<div className="flex gap-2">
							<Button variant="outline" onClick={() => setShowWalkinModal(true)}>
								Add Walk-in Technician
							</Button>
							<Button onClick={() => setShowAddAdmin(true)}>
								Add Admin User
							</Button>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<div className="relative">
						{adminsLoading && (
							<div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-md z-10">
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									Loading admins...
								</div>
							</div>
						)}

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>

							<TableBody>
								{!adminsLoading && admins.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={5}
											className="text-center text-sm text-muted-foreground py-10"
										>
											No admins found
										</TableCell>
									</TableRow>
								) : (
									admins.map((admin) => (
										<TableRow key={admin.id}>
											<TableCell className="font-medium">
												{admin.displayName}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{admin.email || "—"}
											</TableCell>
											<TableCell>
												<Badge variant="outline">{admin.roleName || "—"}</Badge>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														admin.status === "active" ? "default" : "secondary"
													}
												>
													{admin.status}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleEditAdmin(admin)}
												>
													Edit
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>

						<PaginationBar
							page={adminPagination?.page || adminPage}
							pages={adminPagination?.pages || 1}
							pageSize={adminPageSize}
							canPrev={Boolean(adminPagination?.previous) && adminPage > 1}
							canNext={Boolean(adminPagination?.next)}
							onPrev={() => setAdminPage((p) => Math.max(1, p - 1))}
							onNext={() => setAdminPage((p) => p + 1)}
							onPageSizeChange={(n) => {
								setAdminPageSize(n);
								setAdminPage(1);
							}}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Role Permissions */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Role Permissions</CardTitle>
						<CardDescription>Configure what each role can access</CardDescription>
					</div>
					<Button onClick={() => setShowCreateRole(true)} variant="outline" size="sm">
						<Plus className="w-4 h-4 mr-2" />
						Create Role
					</Button>
				</CardHeader>

				<CardContent>
					<div className="space-y-4">
						<div className="flex items-end gap-2">
							<div className="flex-1">
								<Label>Select Role</Label>
								<Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
									<SelectTrigger>
										<SelectValue
											placeholder={
												rolesLoading ? "Loading roles..." : "Select role"
											}
										/>
									</SelectTrigger>

									<SelectContent>
										{roles.map((r) => (
											<SelectItem key={r.id} value={String(r.id)}>
												{r.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<Button 
								variant="destructive" 
								size="icon" 
								onClick={handleDeleteRole}
								disabled={!selectedRoleObj || roles.length <= 1} // Prevent deleting last role
								title="Delete Selected Role"
							>
								<Trash2 className="w-4 h-4" />
							</Button>
						</div>

						<div className="space-y-4 pt-4">
							{Object.entries(permissions).map(([permission, enabled]) => (
								<div
									key={permission}
									className="flex items-center justify-between"
								>
									<Label htmlFor={permission}>{permission}</Label>
									<Switch
										id={permission}
										checked={enabled}
										onCheckedChange={() => togglePermission(permission)}
										disabled={!selectedRoleObj}
									/>
								</div>
							))}
						</div>

						<div className="flex justify-self-end pt-4">
							<Button
								className=""
								onClick={handleSavePermissions}
								disabled={!selectedRoleObj}
							>
								<Save className="w-4 h-4 mr-2" />
								Save Permissions
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Security Sessions (still static for now) */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="w-5 h-5" />
						Security Settings
					</CardTitle>
					<CardDescription>Manage active admin sessions</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					<div className="border-t pt-4">
						<Label className="mb-4 block">Active Admin Sessions</Label>
						<div className="border rounded-lg divide-y">
							<div className="p-4 flex items-center justify-between">
								<div>
									<p className="text-sm font-medium">Current Session</p>
									<p className="text-xs text-muted-foreground">
										Chrome on Windows • Lagos, Nigeria
									</p>
								</div>
								<Badge variant="secondary" className="bg-success text-white">
									Active
								</Badge>
							</div>

							{activeSessions.map((session, index) => (
								<div
									key={index}
									className="p-4 flex items-center justify-between"
								>
									<div>
										<p className="text-sm font-medium">{session.admin}</p>
										<p className="text-xs text-muted-foreground">
											{session.device} • {session.location}
										</p>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleRevokeSession(session)}
									>
										Revoke
									</Button>
								</div>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Modals */}
			<AddAdminModal
				open={showAddAdmin}
				onClose={() => setShowAddAdmin(false)}
				roles={roles}
				onCreated={() => {
					setAdminPage(1);
					refreshAdmins();
				}}
			/>

			{selectedAdmin && (
				<EditAdminModal
					open={showEditAdmin}
					onClose={() => setShowEditAdmin(false)}
					admin={selectedAdmin}
					roles={roles}
					onUpdated={() => {
						refreshAdmins();
						setAdminPage(1);
					}}
				/>
			)}

			<ServicePricesModal
				open={showServicePrices}
				onClose={() => setShowServicePrices(false)}
			/>

			{selectedSession && (
				<RevokeSessionModal
					open={showRevokeSession}
					onClose={() => setShowRevokeSession(false)}
					session={selectedSession}
				/>
			)}

			<CreateRoleModal 
				open={showCreateRole}
				onClose={() => setShowCreateRole(false)}
				onCreated={() => {
					fetchRoles();
				}}
			/>

			<AddWalkinTechnicianModal
				open={showWalkinModal}
				onClose={() => setShowWalkinModal(false)}
			/>
		</div>
	);
}
