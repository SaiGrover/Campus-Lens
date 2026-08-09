-- CampusLens operational submission store (Neon PostgreSQL)
-- The analytical SQLite warehouse under /warehouse remains the reproducible
-- course artefact; this schema provides durable multi-session web submissions.

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
);

CREATE INDEX IF NOT EXISTS idx_campuslens_observed_at
  ON campuslens_complaints(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_campuslens_category_facility
  ON campuslens_complaints(category, facility);

CREATE TABLE IF NOT EXISTS campuslens_audit_log (
  event_id BIGSERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
