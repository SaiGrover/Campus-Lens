# CampusLens Power BI experiment

Import `data/processed/complaints_clean.csv` and define the hierarchy:

`zone -> facility -> floor -> room`

Recommended report pages:

1. Campus pulse: health score, complaints, critical incidents and mean resolution time.
2. OLAP explorer: drillable location hierarchy with category and time slicers.
3. Model evaluation: import `data_science/outputs/model_metrics.json` through Power Query.
4. Pattern discovery: import `data_science/outputs/association_rules.json`.

The relational equivalent is available in `warehouse/campuslens.db`. SQL used for
roll-up, drill-down, slice, dice and pivot is documented in `warehouse/olap_queries.sql`.

