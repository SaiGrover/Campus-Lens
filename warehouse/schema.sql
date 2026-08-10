PRAGMA foreign_keys = ON;

CREATE TABLE dim_student (
  student_key INTEGER PRIMARY KEY AUTOINCREMENT,
  anonymous_id TEXT NOT NULL UNIQUE,
  is_anonymous INTEGER NOT NULL DEFAULT 1 CHECK (is_anonymous IN (0,1)),
  retention_class TEXT NOT NULL DEFAULT 'benchmark-pseudonymous'
);

CREATE TABLE dim_location (
  location_key INTEGER PRIMARY KEY AUTOINCREMENT,
  campus TEXT NOT NULL,
  zone TEXT NOT NULL,
  facility TEXT NOT NULL,
  facility_type TEXT NOT NULL,
  floor TEXT NOT NULL,
  room TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  is_current INTEGER NOT NULL CHECK (is_current IN (0,1)),
  version_number INTEGER NOT NULL,
  UNIQUE(campus, zone, facility, floor, room, version_number)
);

CREATE TABLE dim_date (date_key INTEGER PRIMARY KEY AUTOINCREMENT, full_date TEXT NOT NULL UNIQUE, day_name TEXT NOT NULL, month INTEGER NOT NULL, quarter INTEGER NOT NULL, year INTEGER NOT NULL, academic_term TEXT NOT NULL);
CREATE TABLE dim_time (time_key INTEGER PRIMARY KEY AUTOINCREMENT, hour_of_day INTEGER NOT NULL, time_band TEXT NOT NULL, UNIQUE(hour_of_day,time_band));
CREATE TABLE dim_category (category_key INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE);
CREATE TABLE dim_severity (severity_key INTEGER PRIMARY KEY AUTOINCREMENT, severity_name TEXT NOT NULL UNIQUE, severity_rank INTEGER NOT NULL);
CREATE TABLE dim_source (source_key INTEGER PRIMARY KEY AUTOINCREMENT, source_name TEXT NOT NULL UNIQUE, source_kind TEXT NOT NULL);

CREATE TABLE fact_complaint (
  complaint_key INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  student_key INTEGER NOT NULL REFERENCES dim_student(student_key),
  location_key INTEGER NOT NULL REFERENCES dim_location(location_key),
  date_key INTEGER NOT NULL REFERENCES dim_date(date_key),
  time_key INTEGER NOT NULL REFERENCES dim_time(time_key),
  category_key INTEGER NOT NULL REFERENCES dim_category(category_key),
  severity_key INTEGER NOT NULL REFERENCES dim_severity(severity_key),
  source_key INTEGER NOT NULL REFERENCES dim_source(source_key),
  complaint_text TEXT NOT NULL,
  impact_rating INTEGER NOT NULL CHECK (impact_rating BETWEEN 1 AND 5),
  occupancy_pct INTEGER NOT NULL CHECK (occupancy_pct BETWEEN 0 AND 100),
  humidity_pct INTEGER NOT NULL CHECK (humidity_pct BETWEEN 0 AND 100),
  recurring INTEGER NOT NULL CHECK (recurring IN (0,1)),
  status TEXT NOT NULL,
  resolution_hours REAL NOT NULL,
  has_image INTEGER NOT NULL CHECK (has_image IN (0,1)),
  service_sessions INTEGER NOT NULL DEFAULT 0,
  seeded_anomaly INTEGER NOT NULL DEFAULT 0 CHECK (seeded_anomaly IN (0,1)),
  observed_at TEXT NOT NULL
);

CREATE INDEX idx_fact_location ON fact_complaint(location_key);
CREATE INDEX idx_fact_date ON fact_complaint(date_key);
CREATE INDEX idx_fact_category ON fact_complaint(category_key);
CREATE INDEX idx_fact_severity ON fact_complaint(severity_key);
CREATE INDEX idx_fact_observed ON fact_complaint(observed_at);

CREATE TABLE etl_batch_audit (
  batch_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  source_rows INTEGER NOT NULL,
  loaded_facts INTEGER NOT NULL,
  rejected_rows INTEGER NOT NULL,
  pipeline_version TEXT NOT NULL,
  quality_status TEXT NOT NULL
);
