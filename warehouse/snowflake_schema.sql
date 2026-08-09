-- Normalized alternative to the star-shaped dim_location table.
CREATE TABLE dim_campus (
  campus_key INTEGER PRIMARY KEY,
  campus_name TEXT NOT NULL UNIQUE
);

CREATE TABLE dim_zone (
  zone_key INTEGER PRIMARY KEY,
  campus_key INTEGER NOT NULL REFERENCES dim_campus(campus_key),
  zone_name TEXT NOT NULL
);

CREATE TABLE dim_facility (
  facility_key INTEGER PRIMARY KEY,
  zone_key INTEGER NOT NULL REFERENCES dim_zone(zone_key),
  facility_name TEXT NOT NULL
);

CREATE TABLE dim_room (
  room_key INTEGER PRIMARY KEY,
  facility_key INTEGER NOT NULL REFERENCES dim_facility(facility_key),
  floor_name TEXT NOT NULL,
  room_name TEXT NOT NULL
);

-- In the snowflake variant, fact_complaint.location_key is replaced with room_key.

