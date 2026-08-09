# CampusLens association-rule experiment for R/arules.
# Run after data_science/pipeline.py.
if (!requireNamespace("arules", quietly = TRUE)) {
  install.packages("arules", repos = "https://cloud.r-project.org")
}
library(arules)

complaints <- read.csv("data/processed/complaints_clean.csv", stringsAsFactors = FALSE)
transactions_list <- apply(complaints, 1, function(row) c(
  paste0("Facility=", row[["facility"]]),
  paste0("Time=", row[["time_band"]]),
  paste0("Day=", row[["day_name"]]),
  paste0("Occupancy=", row[["occupancy_band"]]),
  paste0("Humidity=", row[["humidity_band"]]),
  paste0("Category=", row[["category"]]),
  paste0("Severity=", row[["severity"]])
))

transactions <- as(transactions_list, "transactions")
rules <- apriori(
  transactions,
  parameter = list(support = 0.025, confidence = 0.52, minlen = 2, maxlen = 3),
  appearance = list(rhs = grep("^Category=", itemLabels(transactions), value = TRUE), default = "lhs")
)
rules <- sort(rules, by = c("lift", "confidence"), decreasing = TRUE)
output <- as(head(rules, 24), "data.frame")
write.csv(output, "data_science/outputs/association_rules_r.csv", row.names = FALSE)
inspect(head(rules, 10))

