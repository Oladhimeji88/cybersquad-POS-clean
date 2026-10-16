// Website sales come from Odoo's own eCommerce/Website module — a separate
// data source from the local POS stub (which only records in-store sales).
// No backend endpoint for this exists yet; this calls the endpoint the
// backend team needs to add and fails soft (null) until it's deployed, so
// the UI keeps showing "Not available yet" rather than breaking.
//
// Expected contract (to hand to whoever owns the Django/Odoo backend):
//   GET /api/v1/sales/website/summary/?range=today|1d|3d|7d|30d|90d|all
//   -> { success: true, result: { count: number, revenue: number } }
// `count`/`revenue` should be Odoo sale.order records whose sales channel/team
// is the website. Use the same `range` values as the existing
// /jobs/admin/dashboard/stats/?range= endpoint so repair and sales revenue
// for a given period can be combined on the dashboard.
export async function fetchWebsiteSalesSummary(api, range = "today") {
  try {
    const res = await api.get("/sales/website/summary/", { params: { range } });
    if (res?.data?.success) {
      return {
        count: Number(res.data.result?.count) || 0,
        revenue: Number(res.data.result?.revenue) || 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}
