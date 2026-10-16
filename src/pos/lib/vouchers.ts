import type { AxiosInstance } from "axios";

// POS vouchers are created and owned in Odoo (not the repair vouchers managed
// under Payment & Finance). No backend endpoint exposes them yet; this calls the
// endpoint the backend team needs to add and fails soft until it is deployed.
//
// Expected contract:
//   POST /api/v1/sales/vouchers/validate/
//   { code: string, amount: string, lines: [{ product_id, quantity, unit_price }] }
//   -> { success: true, result: { voucher_code: string, discount_amount: number } }
//   Invalid, expired or used codes -> 4xx with { error: { message } }.
// Odoo must validate against the cart and mark the code used when the sale is
// completed; this client only previews the discount.
export async function validatePosVoucher(
  api: AxiosInstance,
  code: string,
  subtotal: number,
  lines: { productId: string; quantity: number; unitPrice: number }[],
): Promise<{ code: string; discount: number }> {
  try {
    const response = await api.post(
      "/sales/vouchers/validate/",
      {
        code,
        amount: String(subtotal),
        lines: lines.map((line) => ({ product_id: line.productId, quantity: line.quantity, unit_price: line.unitPrice })),
      },
      { showLoader: false } as object,
    );
    const result = response?.data?.result;
    const discount = Number(result?.discount_amount);
    if (!(discount > 0)) throw new Error("This voucher gives no discount on this sale.");
    return { code: result.voucher_code ?? code, discount };
  } catch (error: any) {
    if (error?.response?.status === 404 || error?.response?.status === 405 || !error?.response) {
      throw new Error("Odoo voucher lookup is not available yet.");
    }
    throw new Error(error?.response?.data?.error?.message || error?.response?.data?.message || (error instanceof Error ? error.message : "Voucher validation failed."));
  }
}
