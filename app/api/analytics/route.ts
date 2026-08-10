import { NextResponse } from "next/server";
import { ensureComplaintSchema, getSql, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!hasDatabase())
    return NextResponse.json({
      total: 0,
      categories: [],
      hotspots: [],
      refreshedAt: null,
    });
  await ensureComplaintSchema();
  const sql = getSql();
  const totals = (await sql`
    SELECT COUNT(*)::int AS total,
      ROUND(100 - AVG((6 - impact_rating) * 6 + CASE WHEN predicted_risk IN ('CRITICAL','HIGH') THEN 8 ELSE 0 END), 1) AS health_score,
      MAX(loaded_at) AS refreshed_at
    FROM campuslens_fact_complaint
  `) as {
    total: number;
    health_score: number | null;
    refreshed_at: string | null;
  }[];
  const categories = (await sql`
    SELECT category, COUNT(*)::int AS count FROM campuslens_fact_complaint
    GROUP BY category ORDER BY count DESC
  `) as { category: string; count: number }[];
  const hotspots = (await sql`
    SELECT l.facility, COUNT(*)::int AS count, ROUND(AVG(f.impact_rating), 2) AS mean_rating
    FROM campuslens_fact_complaint f JOIN campuslens_dim_location l USING (location_key)
    GROUP BY l.facility ORDER BY count DESC LIMIT 8
  `) as { facility: string; count: number; mean_rating: number }[];
  const response = NextResponse.json({
    ...totals[0],
    categories,
    hotspots,
    source: "incremental PostgreSQL fact mart",
  });
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=30, stale-while-revalidate=120",
  );
  return response;
}
