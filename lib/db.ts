import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export function ensureComplaintSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS campuslens_complaints (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          complaint_text TEXT NOT NULL,
          category TEXT NOT NULL,
          predicted_category TEXT NOT NULL,
          confidence DOUBLE PRECISION NOT NULL,
          zone TEXT NOT NULL,
          facility TEXT NOT NULL,
          floor_name TEXT NOT NULL,
          room_name TEXT NOT NULL,
          location_label TEXT NOT NULL,
          impact_rating INTEGER NOT NULL CHECK (impact_rating BETWEEN 1 AND 5),
          anonymous BOOLEAN NOT NULL,
          reporter_name TEXT,
          duplicate_count INTEGER NOT NULL DEFAULT 0,
          incident_id TEXT,
          predicted_risk TEXT NOT NULL,
          resolution_hours DOUBLE PRECISION NOT NULL,
          image_data TEXT,
          status TEXT NOT NULL DEFAULT 'New',
          observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_campuslens_observed_at ON campuslens_complaints(observed_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campuslens_category_facility ON campuslens_complaints(category, facility)`;
      await sql`
        CREATE TABLE IF NOT EXISTS campuslens_audit_log (
          event_id BIGSERIAL PRIMARY KEY,
          complaint_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          details JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

