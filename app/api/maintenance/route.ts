import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureComplaintSchema, getSql, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(
    expected &&
      supplied &&
      expected.length === supplied.length &&
      timingSafeEqual(Buffer.from(expected!), Buffer.from(supplied!)),
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ deleted: 0, persistence: "disabled" });
  await ensureComplaintSchema();
  const sql = getSql();
  const expired =
    (await sql`SELECT id FROM campuslens_complaints WHERE expires_at <= NOW()`) as {
      id: string;
    }[];
  for (const row of expired) {
    await sql`DELETE FROM campuslens_fact_complaint WHERE complaint_id = ${row.id}`;
    await sql`DELETE FROM campuslens_refresh_queue WHERE complaint_id = ${row.id}`;
    await sql`DELETE FROM campuslens_complaints WHERE id = ${row.id}`;
  }
  await sql`DELETE FROM campuslens_rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`;
  return NextResponse.json({
    deleted: expired.length,
    retentionDays: 365,
    completedAt: new Date().toISOString(),
  });
}
