import { NextRequest, NextResponse } from "next/server";
import { classifyComplaint, estimateResolution, predictRisk, validateComplaintInput } from "@/lib/campuslens";
import { ensureComplaintSchema, getSql, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

const rateWindow = new Map<string, { count: number; expires: number }>();

function allowRequest(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const entry = rateWindow.get(key);
  if (!entry || entry.expires < now) {
    rateWindow.set(key, { count: 1, expires: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

type StoredComplaint = {
  id: string; title: string; complaint_text: string; category: string; predicted_category: string;
  confidence: number; zone: string; facility: string; floor_name: string; room_name: string;
  location_label: string; impact_rating: number; anonymous: boolean; reporter_name: string | null;
  duplicate_count: number; incident_id: string | null; predicted_risk: string; resolution_hours: number;
  image_data: string | null; status: string; observed_at: string;
};

function serialize(row: StoredComplaint) {
  return {
    id: row.id, title: row.title, text: row.complaint_text, category: row.category,
    predictedCategory: row.predicted_category, confidence: row.confidence, zone: row.zone,
    facility: row.facility, floor: row.floor_name, room: row.room_name, location: row.location_label,
    rating: row.impact_rating, anonymous: row.anonymous, reporterName: row.reporter_name ?? undefined,
    duplicateCount: row.duplicate_count, incidentId: row.incident_id ?? undefined,
    predictedRisk: row.predicted_risk, resolutionHours: row.resolution_hours,
    image: row.image_data ?? undefined, status: row.status, observedAt: row.observed_at, time: "Community report",
  };
}

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ complaints: [], persistence: "browser" });
  await ensureComplaintSchema();
  const rows = await getSql()`
    SELECT id, title, complaint_text, category, predicted_category, confidence, zone, facility,
      floor_name, room_name, location_label, impact_rating, anonymous, reporter_name,
      duplicate_count, incident_id, predicted_risk, resolution_hours, image_data, status, observed_at
    FROM campuslens_complaints ORDER BY observed_at DESC LIMIT 250
  ` as StoredComplaint[];
  return NextResponse.json({ complaints: rows.map(serialize), persistence: "postgres" });
}

export async function POST(request: NextRequest) {
  if (!allowRequest(request)) return NextResponse.json({ error: "Too many submissions. Try again in one minute." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const validation = validateComplaintInput(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const value = validation.value;
  const prediction = classifyComplaint(`${value.title} ${value.text}`);
  const extra = value as typeof value & Record<string, unknown>;
  const duplicateCount = Number(extra.duplicateCount ?? 0);
  const image = typeof extra.image === "string" && /^data:image\/(?:webp|jpeg|png);base64,/.test(extra.image) && extra.image.length <= 700_000 ? extra.image : null;
  const anonymous = extra.anonymous !== false;
  const reporterName = !anonymous && typeof extra.reporterName === "string" ? extra.reporterName.trim().slice(0, 80) : null;
  const incidentId = duplicateCount ? `INC-${crypto.randomUUID().slice(0, 8).toUpperCase()}` : null;
  const complaint = {
    ...value,
    id: `CL-U${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    observedAt: new Date().toISOString(),
    time: "Just now",
    status: "New",
    predictedCategory: prediction.category,
    confidence: prediction.confidence,
    predictedRisk: predictRisk(value.rating, duplicateCount),
    resolutionHours: estimateResolution(value.rating, duplicateCount, Number(extra.occupancy ?? 55)),
    anonymous,
    reporterName: reporterName ?? undefined,
    image: image ?? undefined,
    incidentId: incidentId ?? undefined,
  };
  if (hasDatabase()) {
    await ensureComplaintSchema();
    const sql = getSql();
    await sql`
      INSERT INTO campuslens_complaints (
        id, title, complaint_text, category, predicted_category, confidence, zone, facility,
        floor_name, room_name, location_label, impact_rating, anonymous, reporter_name,
        duplicate_count, incident_id, predicted_risk, resolution_hours, image_data, status, observed_at
      ) VALUES (
        ${complaint.id}, ${value.title}, ${value.text}, ${value.category}, ${prediction.category},
        ${prediction.confidence}, ${String(extra.zone ?? "Unspecified")}, ${value.facility},
        ${String(extra.floor ?? "Unspecified")}, ${String(extra.room ?? "Unspecified")},
        ${String(extra.location ?? value.facility)}, ${value.rating}, ${anonymous}, ${reporterName},
        ${duplicateCount}, ${incidentId}, ${complaint.predictedRisk}, ${complaint.resolutionHours},
        ${image}, ${complaint.status}, ${complaint.observedAt}
      )
    `;
    await sql`INSERT INTO campuslens_audit_log (complaint_id, event_type, details) VALUES (${complaint.id}, 'created', ${JSON.stringify({ category: value.category, predictedCategory: prediction.category, anonymous })}::jsonb)`;
    return NextResponse.json({ complaint, persistence: "postgres" }, { status: 201 });
  }

  return NextResponse.json({ complaint, persistence: "browser" }, { status: 201 });
}
