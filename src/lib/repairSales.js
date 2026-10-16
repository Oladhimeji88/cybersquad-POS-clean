// Repair sales come from one place only: the backend's job revenue, the same
// /jobs/admin/dashboard/stats/ figure the Dashboard and Payment & Finance use
// for "Jobs revenue". Do not rebuild it from local tickets — those fields skip
// vouchers and any amount adjusted on the backend, so the totals would drift.
// Returns null when the figure is unavailable so callers show "—", never 0.
export async function fetchRepairSales(api, range) {
  try {
    const res = await api.get("/jobs/admin/dashboard/stats/", { params: { range }, showLoader: false });
    const revenue = res?.data?.result?.stats?.revenue;
    return typeof revenue === "number" ? revenue : null;
  } catch {
    return null;
  }
}
