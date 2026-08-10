import classifierArtifact from "@/public/data/classifier.json";

export const CATEGORIES = [
  "Network",
  "Infrastructure",
  "Cleanliness",
  "Canteen",
  "Electrical",
  "Lab Equipment",
  "Water",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Complaint = {
  id: string;
  category: Category;
  location: string;
  zone?: string;
  facility?: string;
  floor?: string;
  room?: string;
  time: string;
  hour?: number;
  day?: string;
  observedAt: string;
  rating: number;
  text: string;
  status: string;
  occupancy?: number;
  humidity?: number;
  image?: string;
  hasImage?: boolean;
  title?: string;
  anonymous?: boolean;
  reporterName?: string;
  predictedCategory?: Category;
  confidence?: number;
  duplicateCount?: number;
  incidentId?: string;
  predictedRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolutionHours?: number;
};

type ClassifierArtifact = {
  algorithm: string;
  classes: string[];
  vocabulary: Record<string, number>;
  idf: number[];
  classLogPrior: number[];
  featureLogProb: number[][];
  temperature?: number;
};

const model = classifierArtifact as ClassifierArtifact;

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function features(value: string) {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  const terms = [
    ...tokens,
    ...tokens
      .slice(0, -1)
      .map((token, index) => `${token} ${tokens[index + 1]}`),
  ];
  const counts = new Map<number, number>();
  for (const term of terms) {
    const index = model.vocabulary[term];
    if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  const weighted = [...counts.entries()].map(
    ([index, count]) =>
      [index, (1 + Math.log(count)) * model.idf[index]] as const,
  );
  const norm =
    Math.sqrt(weighted.reduce((sum, [, value]) => sum + value * value, 0)) || 1;
  return weighted.map(([index, value]) => [index, value / norm] as const);
}

export function classifyComplaint(value: string): {
  category: Category;
  confidence: number;
  algorithm: string;
} {
  const vector = features(value);
  const scores = model.classes.map((_, classIndex) => {
    let score = model.classLogPrior[classIndex];
    for (const [featureIndex, weight] of vector)
      score += weight * model.featureLogProb[classIndex][featureIndex];
    return score;
  });
  const temperature = Math.max(0.1, model.temperature ?? 1);
  const calibratedScores = scores.map((score) => score / temperature);
  const maximum = Math.max(...calibratedScores);
  const probabilities = calibratedScores.map((score) =>
    Math.exp(score - maximum),
  );
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  const winner = probabilities.indexOf(Math.max(...probabilities));
  return {
    category: model.classes[winner] as Category,
    confidence: Math.round((probabilities[winner] / total) * 1000) / 10,
    algorithm: model.algorithm,
  };
}

export function redactPii(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+91[-\s]?)?[6-9]\d{9}/g, "[phone removed]")
    .replace(
      /\b(?:roll|enrol(?:lment)?)\s*(?:no\.?|number)?\s*[:#-]?\s*[A-Z0-9/-]{5,}\b/gi,
      "[student id removed]",
    );
}

function tokenSet(value: string) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

export function similarity(left: string, right: string) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size || 1;
  return intersection / union;
}

export function findDuplicates(
  candidate: Pick<Complaint, "text" | "category" | "facility" | "location">,
  complaints: Complaint[],
) {
  return complaints
    .map((complaint) => {
      const sameCategory = complaint.category === candidate.category ? 0.24 : 0;
      const samePlace =
        normalizeText(complaint.facility ?? complaint.location) ===
        normalizeText(candidate.facility ?? candidate.location)
          ? 0.26
          : 0;
      const textScore = similarity(complaint.text, candidate.text) * 0.5;
      return { complaint, score: sameCategory + samePlace + textScore };
    })
    .filter((match) => match.score >= 0.62)
    .sort((a, b) => b.score - a.score);
}

export function predictRisk(rating: number, duplicates: number) {
  return duplicates >= 4 || rating === 1
    ? "CRITICAL"
    : duplicates >= 2 || rating === 2
      ? "HIGH"
      : rating === 3
        ? "MEDIUM"
        : "LOW";
}

export function estimateResolution(
  rating: number,
  duplicates: number,
  occupancy = 55,
) {
  return Number(
    Math.max(
      0.4,
      1 +
        (6 - rating) * 0.72 +
        Math.min(duplicates, 5) * 0.35 +
        occupancy * 0.018,
    ).toFixed(1),
  );
}

export function validateComplaintInput(input: unknown) {
  if (!input || typeof input !== "object")
    return { ok: false as const, error: "Invalid request body." };
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const facility =
    typeof body.facility === "string" ? body.facility.trim() : "";
  const category =
    typeof body.category === "string" &&
    CATEGORIES.includes(body.category as Category)
      ? (body.category as Category)
      : null;
  const rating = Number(body.rating);
  if (title.length < 4 || title.length > 100)
    return {
      ok: false as const,
      error: "Title must contain 4–100 characters.",
    };
  if (text.length < 12 || text.length > 1200)
    return {
      ok: false as const,
      error: "Complaint must contain 12–1200 characters.",
    };
  if (!facility)
    return { ok: false as const, error: "A facility is required." };
  if (!category)
    return { ok: false as const, error: "Select a valid category." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return {
      ok: false as const,
      error: "Impact rating must be between 1 and 5.",
    };
  return {
    ok: true as const,
    value: {
      ...body,
      title,
      text: redactPii(text),
      facility,
      category,
      rating,
    },
  };
}
