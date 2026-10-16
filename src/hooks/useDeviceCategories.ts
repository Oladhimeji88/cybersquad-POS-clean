import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import {
  FALLBACK_DEVICE_CATEGORIES,
  getDeviceCategoryLabel,
  type DeviceCategory,
  sortDeviceCategories,
  updateDeviceCategoryLabelCache,
} from "@/lib/deviceCategories";

type UseDeviceCategoriesOptions = {
  onlyActive?: boolean;
  autoFetch?: boolean;
  hideOther?: boolean;
};

export function useDeviceCategories(options: UseDeviceCategoriesOptions = {}) {
  const { onlyActive = false, autoFetch = true, hideOther = false } = options;
  const { api } = useApi();
  const [categories, setCategories] = useState<DeviceCategory[]>([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get("/jobs/device-categories/?page_size=100", {
        showLoader: false,
      } as any);
      const rawCategories = Array.isArray(response?.data?.result) ? response.data.result : [];
      const normalizedCategories = sortDeviceCategories(rawCategories);

      updateDeviceCategoryLabelCache(normalizedCategories);
      setCategories(normalizedCategories);
    } catch (fetchError: any) {
      console.error("Failed to fetch device categories:", fetchError);
      setError(
        fetchError?.response?.data?.message ||
          fetchError?.message ||
          "Failed to load device categories."
      );
      setCategories(FALLBACK_DEVICE_CATEGORIES);
      updateDeviceCategoryLabelCache(FALLBACK_DEVICE_CATEGORIES);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }

    void fetchCategories();
  }, [autoFetch, fetchCategories]);

  const selectableCategories = useMemo(() => {
    const source = categories.length > 0 ? categories : FALLBACK_DEVICE_CATEGORIES;
    let filtered = onlyActive ? source.filter((category) => category.is_active) : source;
    
    if (hideOther) {
      filtered = filtered.filter((category) => category.name !== "other");
    }
    
    return filtered.length > 0 ? filtered : FALLBACK_DEVICE_CATEGORIES;
  }, [categories, onlyActive, hideOther]);

  const defaultCategoryName = useMemo(() => {
    const defaultCategory =
      selectableCategories.find((category) => category.is_default) || selectableCategories[0];
    return defaultCategory?.name || "other";
  }, [selectableCategories]);

  const getCategoryLabel = useCallback(
    (value?: string | null) => {
      const match = selectableCategories.find((category) => category.name === value);
      return match?.label || getDeviceCategoryLabel(value);
    },
    [selectableCategories]
  );

  return {
    categories,
    selectableCategories,
    loading,
    error,
    defaultCategoryName,
    fetchCategories,
    getCategoryLabel,
  };
}
