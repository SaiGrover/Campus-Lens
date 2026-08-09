-- Roll-up: room -> facility -> zone
SELECT l.zone, l.facility, l.floor, l.room, COUNT(*) complaint_count
FROM fact_complaint f JOIN dim_location l ON f.location_key = l.location_key
GROUP BY ROLLUP(l.zone, l.facility, l.floor, l.room);

-- Drill-down: campus hotspot to room and category
SELECT l.zone, l.facility, l.floor, l.room, c.category_name, COUNT(*) complaint_count
FROM fact_complaint f
JOIN dim_location l ON f.location_key = l.location_key
JOIN dim_category c ON f.category_key = c.category_key
WHERE l.facility = 'CL3'
GROUP BY l.zone, l.facility, l.floor, l.room, c.category_name
ORDER BY complaint_count DESC;

-- Slice: Network complaints only
SELECT * FROM mart_campus_health WHERE category_name = 'Network';

-- Dice: selected facilities, categories and time periods
SELECT * FROM mart_campus_health
WHERE facility IN ('CL3', 'CL15')
  AND category_name IN ('Network', 'Lab Equipment')
  AND time_band IN ('10-12', '12-2');

-- Pivot-friendly result
SELECT facility,
  SUM(CASE WHEN time_band = '8-10' THEN complaint_count ELSE 0 END) AS "8-10",
  SUM(CASE WHEN time_band = '10-12' THEN complaint_count ELSE 0 END) AS "10-12",
  SUM(CASE WHEN time_band = '12-2' THEN complaint_count ELSE 0 END) AS "12-2",
  SUM(CASE WHEN time_band = '2-4' THEN complaint_count ELSE 0 END) AS "2-4"
FROM mart_campus_health GROUP BY facility;

