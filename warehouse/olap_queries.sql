-- Roll-up (executable in SQLite)
SELECT * FROM mart_location_rollup ORDER BY CASE level WHEN 'CAMPUS' THEN 1 WHEN 'ZONE' THEN 2 WHEN 'FACILITY' THEN 3 WHEN 'FLOOR' THEN 4 ELSE 5 END, complaint_count DESC;
-- Drill-down
SELECT l.zone,l.facility,l.floor,l.room,c.category_name,COUNT(*) complaint_count FROM fact_complaint f JOIN dim_location l ON f.location_key=l.location_key JOIN dim_category c ON f.category_key=c.category_key WHERE l.facility='CL3' GROUP BY l.zone,l.facility,l.floor,l.room,c.category_name ORDER BY complaint_count DESC;
-- Slice
SELECT * FROM mart_campus_health WHERE category_name='Network';
-- Dice
SELECT * FROM mart_campus_health WHERE facility IN ('CL3','CL15') AND category_name IN ('Network','Lab Equipment') AND time_band IN ('10-12','12-2');
-- Pivot-friendly conditional aggregation
SELECT facility,SUM(CASE WHEN time_band='8-10' THEN complaint_count ELSE 0 END) "8-10",SUM(CASE WHEN time_band='10-12' THEN complaint_count ELSE 0 END) "10-12",SUM(CASE WHEN time_band='12-2' THEN complaint_count ELSE 0 END) "12-2",SUM(CASE WHEN time_band='2-4' THEN complaint_count ELSE 0 END) "2-4" FROM mart_campus_health GROUP BY facility;
