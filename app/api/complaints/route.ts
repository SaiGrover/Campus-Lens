import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  classifyComplaint,
  estimateResolution,
  predictRisk,
  validateComplaintInput,
} from "@/lib/campuslens";
import { ensureComplaintSchema, getSql, hasDatabase } from "@/lib/db";
import { redactPII, sanitizeImageData, stablePrivateHash } from "@/lib/privacy";

export const runtime = "nodejs";

const localRateWindow = new Map<string, { count: number; expires: number }>();

function isAdmin(request: NextRequest) {
  const expected = process.env.ADMIN_API_TOKEN;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || expected.length !== supplied.length)
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function requestIdentity(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

async function allowRequest(request: NextRequest) {
  const clientHash = stablePrivateHash(requestIdentity(request));
  if (hasDatabase()) {
    await ensureComplaintSchema();
    const rows = (await getSql()`
      INSERT INTO campuslens_rate_limits (client_hash, window_start, request_count)
      VALUES (${clientHash}, date_trunc('minute', NOW()), 1)
      ON CONFLICT (client_hash, window_start)
      DO UPDATE SET request_count = campuslens_rate_limits.request_count + 1
      RETURNING request_count
    `) as { request_count: number }[];
    return rows[0].request_count <= 10;
  }
  const now = Date.now();
  const entry = localRateWindow.get(clientHash);
  if (!entry || entry.expires < now) {
    localRateWindow.set(clientHash, { count: 1, expires: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

type StoredComplaint = {
  id: string;
  title: string;
  complaint_text: string;
  category: string;
  predicted_category: string;
  confidence: number;
  zone: string;
  facility: string;
  floor_name: string;
  room_name: string;
  location_label: string;
  impact_rating: number;
  anonymous: boolean;
  reporter_alias_hash: string | null;
  duplicate_count: number;
  incident_id: string | null;
  predicted_risk: string;
  resolution_hours: number;
  image_sha256: string | null;
  image_mime: string | null;
  status: string;
  observed_at: string;
};

function serializePublic(row: StoredComplaint) {
  return {
    id: row.id,
    title: row.title,
    text: row.complaint_text,
    category: row.category,
    predictedCategory: row.predicted_category,
    confidence: row.confidence,
    zone: row.zone,
    facility: row.facility,
    floor: row.floor_name,
    room: row.room_name,
    location: row.location_label,
    rating: row.impact_rating,
    anonymous: true,
    duplicateCount: row.duplicate_count,
    incidentId: row.incident_id ?? undefined,
    predictedRisk: row.predicted_risk,
    resolutionHours: row.resolution_hours,
    hasImage: Boolean(row.image_sha256),
    status: row.status,
    observedAt: row.observed_at,
    time: "Community report",
  };
}

function securityHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET(request: NextRequest) {
  if (!hasDatabase())
    return securityHeaders(
      NextResponse.json({ complaints: [], persistence: "browser" }),
    );
  await ensureComplaintSchema();
  const admin = request.nextUrl.searchParams.get("scope") === "admin";
  if (admin && !isAdmin(request))
    return securityHeaders(
      NextResponse.json(
        { error: "Administrator authorization required." },
        { status: 401 },
      ),
    );
  const limit = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)),
  );
  const offset = Math.max(
    0,
    Number(request.nextUrl.searchParams.get("offset") || 0),
  );
  const rows = (await getSql()`
    SELECT id, title, complaint_text, category, predicted_category, confidence, zone, facility,
      floor_name, room_name, location_label, impact_rating, anonymous, reporter_alias_hash,
      duplicate_count, incident_id, predicted_risk, resolution_hours, image_sha256, image_mime, status, observed_at
    FROM campuslens_complaints WHERE expires_at > NOW()
    ORDER BY observed_at DESC LIMIT ${limit} OFFSET ${offset}
  `) as StoredComplaint[];
  const complaints = rows.map((row) =>
    admin
      ? {
          ...serializePublic(row),
          reporterAliasHash: row.reporter_alias_hash,
          imageSha256: row.image_sha256,
        }
      : serializePublic(row),
  );
  return securityHeaders(
    NextResponse.json({
      complaints,
      pagination: { limit, offset, hasMore: rows.length === limit },
      persistence: "postgres",
    }),
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Cross-origin submissions are not accepted." },
      { status: 403 },
    );
  if (!(await allowRequest(request)))
    return NextResponse.json(
      { error: "Too many submissions. Try again in one minute." },
      { status: 429 },
    );
  const body = await request.json().catch(() => null);
  const validation = validateComplaintInput(body);
  if (!validation.ok)
    return NextResponse.json({ error: validation.error }, { status: 400 });

  const extra = validation.value as typeof validation.value &
    Record<string, unknown>;
  const value = {
    ...validation.value,
    title: redactPII(validation.value.title),
    text: redactPII(validation.value.text),
  };
  const prediction = classifyComplaint(`${value.title} ${value.text}`);
  const duplicateCount = Math.max(
    0,
    Math.min(99, Number(extra.duplicateCount ?? 0)),
  );
  let sanitizedImage: Awaited<ReturnType<typeof sanitizeImageData>> = null;
  try {
    sanitizedImage = await sanitizeImageData(extra.image);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Image could not be processed.",
      },
      { status: 400 },
    );
  }
  const anonymous = extra.anonymous !== false;
  const reporterAliasHash =
    !anonymous &&
    typeof extra.reporterName === "string" &&
    extra.reporterName.trim()
      ? stablePrivateHash(extra.reporterName.trim().toLocaleLowerCase())
      : null;
  const incidentId = duplicateCount
    ? `INC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    : null;
  const complaint = {
    title: value.title,
    text: value.text,
    category: value.category,
    facility: value.facility,
    zone: String(extra.zone ?? "Unspecified"),
    floor: String(extra.floor ?? "Unspecified"),
    room: String(extra.room ?? "Unspecified"),
    location: String(extra.location ?? value.facility),
    rating: value.rating,
    id: `CL-U${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    observedAt: new Date().toISOString(),
    time: "Just now",
    status: "New",
    predictedCategory: prediction.category,
    confidence: prediction.confidence,
    predictedRisk: predictRisk(value.rating, duplicateCount),
    resolutionHours: estimateResolution(
      value.rating,
      duplicateCount,
      Number(extra.occupancy ?? 55),
    ),
    anonymous: true,
    hasImage: Boolean(sanitizedImage),
    image: sanitizedImage?.ephemeralData,
    incidentId: incidentId ?? undefined,
  };
  if (hasDatabase()) {
    await ensureComplaintSchema();
    const sql = getSql();
    await sql`
      INSERT INTO campuslens_complaints (
        id, title, complaint_text, category, predicted_category, confidence, zone, facility,
        floor_name, room_name, location_label, impact_rating, anonymous, reporter_alias_hash,
        duplicate_count, incident_id, predicted_risk, resolution_hours, image_sha256, image_mime, status, observed_at
      ) VALUES (
        ${complaint.id}, ${value.title}, ${value.text}, ${value.category}, ${prediction.category},
        ${prediction.confidence}, ${String(extra.zone ?? "Unspecified")}, ${value.facility},
        ${String(extra.floor ?? "Unspecified")}, ${String(extra.room ?? "Unspecified")},
        ${String(extra.location ?? value.facility)}, ${value.rating}, TRUE, ${reporterAliasHash},
        ${duplicateCount}, ${incidentId}, ${complaint.predictedRisk}, ${complaint.resolutionHours},
        ${sanitizedImage?.sha256 ?? null}, ${sanitizedImage?.mime ?? null}, ${complaint.status}, ${complaint.observedAt}
      )
    `;
    await sql`INSERT INTO campuslens_audit_log (complaint_id, event_type, details) VALUES (${complaint.id}, 'created', ${JSON.stringify({ category: value.category, predictedCategory: prediction.category, anonymous, piiRedacted: true })}::jsonb)`;
    await sql`INSERT INTO campuslens_refresh_queue (complaint_id) VALUES (${complaint.id}) ON CONFLICT (complaint_id) DO NOTHING`;
    const locationRows = (await sql`
      INSERT INTO campuslens_dim_location (zone, facility, floor_name, room_name)
      VALUES (${String(extra.zone ?? "Unspecified")}, ${value.facility}, ${String(extra.floor ?? "Unspecified")}, ${String(extra.room ?? "Unspecified")})
      ON CONFLICT (zone, facility, floor_name, room_name)
      DO UPDATE SET facility = EXCLUDED.facility
      RETURNING location_key
    `) as { location_key: number }[];
    await sql`
      INSERT INTO campuslens_fact_complaint (complaint_id, location_key, category, impact_rating, predicted_risk, observed_at)
      VALUES (${complaint.id}, ${locationRows[0].location_key}, ${value.category}, ${value.rating}, ${complaint.predictedRisk}, ${complaint.observedAt})
      ON CONFLICT (complaint_id) DO NOTHING
    `;
    await sql`INSERT INTO campuslens_etl_audit (batch_id, complaint_id, load_type, status) VALUES (${crypto.randomUUID()}, ${complaint.id}, 'incremental', 'loaded')`;
    await sql`UPDATE campuslens_refresh_queue SET processed_at = NOW() WHERE complaint_id = ${complaint.id}`;
    return securityHeaders(
      NextResponse.json(
        { complaint, persistence: "postgres", refreshQueued: true },
        { status: 201 },
      ),
    );
  }
  return securityHeaders(
    NextResponse.json({ complaint, persistence: "browser" }, { status: 201 }),
  );
}
