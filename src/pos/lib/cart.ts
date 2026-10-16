import { useMemo, useState } from "react";
import type { PosProduct, SelectedDevice, DeviceLine } from "./devices";

export interface PosCartLine extends DeviceLine {
  productId: string;
  name: string;
  sku?: string;
  unitPrice: number;
  quantity: number;
}

export function usePosCart() {
  const [lines, setLines] = useState<PosCartLine[]>([]);

  const addItem = (item: PosProduct, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === item.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === item.id ? { ...line, quantity: line.quantity + quantity } : line
        );
      }
      return [
        ...prev,
        {
          productId: item.id,
          name: item.name,
          sku: item.sku,
          unitPrice: item.price,
          quantity,
          tracking: item.tracking,
          warranty: item.warranty,
          isDemo: item.isDemo,
        },
      ];
    });
  };

  const setDevices = (item: PosProduct, devices: SelectedDevice[]) => {
    setLines((prev) => {
      const rest = prev.filter((line) => line.productId !== item.id);
      if (!devices.length) return rest;
      return [...rest, { productId: item.id, name: item.name, sku: item.sku,
        unitPrice: item.price, quantity: devices.length, tracking: "serial",
        warranty: item.warranty, devices, isDemo: item.isDemo }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) {
        return prev.filter((line) => line.productId !== productId);
      }
      return prev.map((line) => (line.productId === productId ? { ...line, quantity, devices: line.devices?.slice(0, quantity) } : line));
    });
  };

  const setPrice = (productId: string, unitPrice: number) => {
    setLines((prev) => prev.map((line) => (line.productId === productId ? { ...line, unitPrice } : line)));
  };

  const removeItem = (productId: string) => {
    setLines((prev) => prev.filter((line) => line.productId !== productId));
  };

  const clear = () => setLines([]);

  const restore = (savedLines: PosCartLine[]) => setLines(savedLines);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [lines]
  );

  return { lines, addItem, setDevices, updateQuantity, setPrice, removeItem, clear, restore, subtotal };
}
