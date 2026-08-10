DROP VIEW IF EXISTS mart_campus_health;
CREATE VIEW mart_campus_health AS
SELECT d.full_date,l.campus,l.zone,l.facility,l.floor,l.room,c.category_name,s.severity_name,t.time_band,
       COUNT(*) complaint_count,AVG(f.impact_rating) mean_impact,AVG(f.resolution_hours) mean_resolution_hours,
       SUM(CASE WHEN f.status!='Resolved' THEN 1 ELSE 0 END) unresolved_count
FROM fact_complaint f JOIN dim_date d ON d.date_key=f.date_key JOIN dim_location l ON l.location_key=f.location_key
JOIN dim_category c ON c.category_key=f.category_key JOIN dim_severity s ON s.severity_key=f.severity_key JOIN dim_time t ON t.time_key=f.time_key
GROUP BY d.full_date,l.campus,l.zone,l.facility,l.floor,l.room,c.category_name,s.severity_name,t.time_band;

DROP VIEW IF EXISTS mart_location_summary;
CREATE VIEW mart_location_summary AS
SELECT l.campus,l.zone,l.facility,COUNT(*) complaint_count,AVG(f.resolution_hours) mean_resolution_hours,AVG(f.impact_rating) mean_impact
FROM fact_complaint f JOIN dim_location l ON l.location_key=f.location_key GROUP BY l.campus,l.zone,l.facility;

-- SQLite-compatible materialized roll-up levels using UNION ALL rather than unsupported ROLLUP().
DROP VIEW IF EXISTS mart_location_rollup;
CREATE VIEW mart_location_rollup AS
SELECT 'ROOM' level,campus,zone,facility,floor,room,COUNT(*) complaint_count FROM fact_complaint f JOIN dim_location l ON l.location_key=f.location_key GROUP BY campus,zone,facility,floor,room
UNION ALL SELECT 'FLOOR',campus,zone,facility,floor,'ALL',COUNT(*) FROM fact_complaint f JOIN dim_location l ON l.location_key=f.location_key GROUP BY campus,zone,facility,floor
UNION ALL SELECT 'FACILITY',campus,zone,facility,'ALL','ALL',COUNT(*) FROM fact_complaint f JOIN dim_location l ON l.location_key=f.location_key GROUP BY campus,zone,facility
UNION ALL SELECT 'ZONE',campus,zone,'ALL','ALL','ALL',COUNT(*) FROM fact_complaint f JOIN dim_location l ON l.location_key=f.location_key GROUP BY campus,zone
UNION ALL SELECT 'CAMPUS',campus,'ALL','ALL','ALL','ALL',COUNT(*) FROM fact_complaint f JOIN dim_location l ON l.location_key=f.location_key GROUP BY campus;
