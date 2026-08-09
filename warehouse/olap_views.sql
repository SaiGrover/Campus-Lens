DROP VIEW IF EXISTS mart_campus_health;
CREATE VIEW mart_campus_health AS
SELECT
  d.full_date,
  l.zone,
  l.facility,
  l.floor,
  l.room,
  c.category_name,
  s.severity_name,
  t.time_band,
  COUNT(*) AS complaint_count,
  AVG(f.impact_rating) AS mean_impact,
  AVG(f.resolution_hours) AS mean_resolution_hours,
  SUM(CASE WHEN f.status != 'Resolved' THEN 1 ELSE 0 END) AS unresolved_count
FROM fact_complaint f
JOIN dim_date d ON d.date_key = f.date_key
JOIN dim_location l ON l.location_key = f.location_key
JOIN dim_category c ON c.category_key = f.category_key
JOIN dim_severity s ON s.severity_key = f.severity_key
JOIN dim_time t ON t.time_key = f.time_key
GROUP BY d.full_date, l.zone, l.facility, l.floor, l.room, c.category_name, s.severity_name, t.time_band;

DROP VIEW IF EXISTS mart_location_summary;
CREATE VIEW mart_location_summary AS
SELECT l.zone, l.facility, COUNT(*) complaint_count,
       AVG(f.resolution_hours) mean_resolution_hours
FROM fact_complaint f
JOIN dim_location l ON l.location_key = f.location_key
GROUP BY l.zone, l.facility;

