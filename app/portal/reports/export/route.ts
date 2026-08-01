import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { buildOrdersCsv, getReportOrders } from "@/lib/reports";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const config = await readConfig();
  const url = new URL(request.url);
  const refreshParam = Number(url.searchParams.get("refresh") || "");
  const orders = await getReportOrders(config, {
    forceRescan: Number.isFinite(refreshParam) && refreshParam > 0,
    maxOrdersToScan: Number.isFinite(refreshParam) && refreshParam > 0 ? refreshParam : undefined,
  });
  const csv = buildOrdersCsv(orders);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="chuggaboom-funnel-orders.csv"',
      "Cache-Control": "no-store",
    },
  });
}
