import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { buildOrdersCsv, getReportOrders } from "@/lib/reports";

export async function GET() {
  if (!(await isAuthenticated())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const config = await readConfig();
  const orders = await getReportOrders(config);
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
