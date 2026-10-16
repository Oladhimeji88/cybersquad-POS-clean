import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { Edit2, Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useApi } from "../hooks/useApi";
import { useDeviceCategories } from "@/hooks/useDeviceCategories";
import { DeviceCategoryModal } from "./DeviceCategoryModal";

export function DeviceCategoriesPanel() {
	const { api } = useApi();
	const {
		categories: deviceCategories,
		loading: deviceCategoriesLoading,
		fetchCategories,
	} = useDeviceCategories();

	const [showDeviceCategoryModal, setShowDeviceCategoryModal] = useState(false);
	const [categoryToEdit, setCategoryToEdit] = useState(null);

	const openCreate = () => {
		setCategoryToEdit(null);
		setShowDeviceCategoryModal(true);
	};

	const openEdit = (category) => {
		setCategoryToEdit(category);
		setShowDeviceCategoryModal(true);
	};

	const handleDelete = async (category) => {
		if (
			!window.confirm(
				`Delete ${category.label}? This removes it from frontdesk category options.`,
			)
		) {
			return;
		}

		try {
			await api.delete(`/jobs/device-categories/${category.id}/`);
			toast.success("Device category deleted.");
			fetchCategories();
		} catch (error) {
			console.error("Failed to delete device category:", error);
			toast.error(
				error?.response?.data?.message || "Failed to delete device category.",
			);
		}
	};

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Tag className="w-5 h-5" />
						Device Categories
					</CardTitle>
					<CardDescription>
						Manage the categories that frontdesk staff can choose during ticket creation.
					</CardDescription>
					<CardAction>
						<Button onClick={openCreate}>
							<Plus className="w-4 h-4 mr-2" />
							Add Category
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent>
					<div className="border rounded-lg overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Label</TableHead>
									<TableHead>System Name</TableHead>
									<TableHead>Description</TableHead>
									<TableHead>Order</TableHead>
									<TableHead>Jobs</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>

							<TableBody>
								{deviceCategoriesLoading ? (
									<TableRow>
										<TableCell colSpan={7} className="py-10 text-center">
											<div className="inline-flex items-center gap-2 text-muted-foreground">
												<Loader2 className="h-4 w-4 animate-spin" />
												Loading categories...
											</div>
										</TableCell>
									</TableRow>
								) : deviceCategories.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
											No device categories found.
										</TableCell>
									</TableRow>
								) : (
									deviceCategories.map((category) => (
										<TableRow key={category.id}>
											<TableCell className="font-medium">{category.label}</TableCell>
											<TableCell className="font-mono text-xs">{category.name}</TableCell>
											<TableCell className="max-w-[280px] truncate">
												{category.description || "No description"}
											</TableCell>
											<TableCell>{category.sort_order}</TableCell>
											<TableCell>
												{Number(category.active_jobs_count || 0).toLocaleString()}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Badge variant={category.is_active ? "default" : "outline"}>
														{category.is_active ? "Active" : "Inactive"}
													</Badge>
													{category.is_default && (
														<Badge variant="secondary">Default</Badge>
													)}
												</div>
											</TableCell>
											<TableCell className="text-right">
												<div className="flex items-center justify-end gap-2">
													<Button
														variant="ghost"
														size="icon"
														onClick={() => openEdit(category)}
														title="Edit category"
													>
														<Edit2 className="w-4 h-4" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														onClick={() => handleDelete(category)}
														title="Delete category"
													>
														<Trash2 className="w-4 h-4 text-destructive" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<DeviceCategoryModal
				open={showDeviceCategoryModal}
				onClose={() => {
					setShowDeviceCategoryModal(false);
					setCategoryToEdit(null);
				}}
				category={categoryToEdit}
				onSaved={() => {
					fetchCategories();
				}}
			/>
		</>
	);
}

export default DeviceCategoriesPanel;
