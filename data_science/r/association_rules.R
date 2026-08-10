# CampusLens association-rule validation in base R 4.6.
# No packages are installed at runtime. Run from the repository root after the Python pipeline.

input_path <- "data/processed/complaints_clean.csv"
output_path <- "data_science/outputs/association_rules_r.csv"
complaints <- read.csv(input_path, stringsAsFactors = FALSE, check.names = FALSE)
complaints <- complaints[order(as.POSIXct(complaints$observed_at, tz = "UTC")), ]
split_index <- floor(nrow(complaints) * 0.70)
training <- complaints[seq_len(split_index), ]
validation <- complaints[(split_index + 1):nrow(complaints), ]

fields <- c("facility_type", "time_band", "day_name", "occupancy_band", "humidity_band", "severity", "source_system")
labels <- c(facility_type = "FacilityType", time_band = "Time", day_name = "Day", occupancy_band = "Occupancy",
            humidity_band = "Humidity", severity = "Severity", source_system = "Source")
categories <- sort(unique(complaints$category))

metric <- function(data, conditions, category) {
  antecedent <- rep(TRUE, nrow(data))
  for (condition in conditions) antecedent <- antecedent & data[[condition$field]] == condition$value
  consequent <- data$category == category
  joint <- antecedent & consequent
  support <- mean(joint)
  confidence <- if (sum(antecedent) == 0) 0 else sum(joint) / sum(antecedent)
  base_rate <- mean(consequent)
  lift <- if (base_rate == 0) 0 else confidence / base_rate
  table <- matrix(c(sum(joint), sum(antecedent & !consequent), sum(!antecedent & consequent), sum(!antecedent & !consequent)), nrow = 2)
  p_value <- fisher.test(table, alternative = "greater")$p.value
  c(support = support, confidence = confidence, lift = lift, p_value = p_value)
}

condition_sets <- list()
for (field in fields) for (value in sort(unique(training[[field]]))) {
  condition_sets[[length(condition_sets) + 1]] <- list(list(field = field, value = value))
}
for (left_index in seq_len(length(fields) - 1)) for (right_index in (left_index + 1):length(fields)) {
  left <- fields[left_index]; right <- fields[right_index]
  pairs <- unique(training[c(left, right)])
  for (row_index in seq_len(nrow(pairs))) condition_sets[[length(condition_sets) + 1]] <- list(
    list(field = left, value = pairs[[left]][row_index]), list(field = right, value = pairs[[right]][row_index]))
}

rows <- list()
for (conditions in condition_sets) for (category in categories) {
  train_metric <- metric(training, conditions, category)
  if (train_metric["support"] < 0.012 || train_metric["confidence"] < 0.25) next
  valid_metric <- metric(validation, conditions, category)
  contextual <- any(vapply(conditions, function(item) item$field %in% c("time_band", "day_name", "occupancy_band", "humidity_band", "severity", "source_system"), logical(1)))
  if (!contextual || valid_metric["support"] < 0.006 || valid_metric["confidence"] < 0.20 || valid_metric["lift"] < 1.06 || abs(train_metric["confidence"] - valid_metric["confidence"]) > 0.22) next
  lhs <- paste(vapply(conditions, function(item) paste0(labels[[item$field]], "=", item$value), character(1)), collapse = " & ")
  rows[[length(rows) + 1]] <- data.frame(lhs = lhs, rhs = paste0("Category=", category),
    support = train_metric["support"], confidence = train_metric["confidence"], lift = train_metric["lift"],
    validation_support = valid_metric["support"], validation_confidence = valid_metric["confidence"],
    validation_lift = valid_metric["lift"], p_value = valid_metric["p_value"], stringsAsFactors = FALSE)
}

rules <- if (length(rows)) do.call(rbind, rows) else data.frame()
if (nrow(rules)) {
  rules$fdr_q_value <- p.adjust(rules$p_value, method = "BH")
  rules$stable <- rules$fdr_q_value <= 0.05
  rules <- rules[order(-as.integer(rules$stable), -rules$validation_lift, -rules$validation_confidence), ]
}
write.csv(rules, output_path, row.names = FALSE)
cat(sprintf("R base-rule miner: %d candidates, %d FDR-stable rules, %d/%d train/validation rows\n",
            nrow(rules), if (nrow(rules)) sum(rules$stable) else 0, nrow(training), nrow(validation)))
