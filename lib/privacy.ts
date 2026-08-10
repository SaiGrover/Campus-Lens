import { createHash } from "node:crypto";
import sharp from "sharp";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g;
const ROLL_NUMBER = /\b(?:\d{2}[A-Z]{2,5}\d{3,5}|[A-Z]{2,5}[-/]?\d{4,8})\b/gi;

export function redactPII(value: string) {
  return value
    .replace(EMAIL, "[email removed]")
    .replace(PHONE, "[phone removed]")
    .replace(ROLL_NUMBER, "[identifier removed]");
}

export function stablePrivateHash(value: string) {
  const pepper =
    process.env.PRIVACY_HASH_PEPPER || "campuslens-development-only";
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export async function sanitizeImageData(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^data:image\/(?:webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(
    value,
  );
  if (!match) throw new Error("Image must be PNG, JPEG, or WebP.");
  const input = Buffer.from(match[1], "base64");
  if (input.byteLength > 5_000_000)
    throw new Error("Image exceeds the 5 MB upload limit.");
  const metadata = await sharp(input, {
    failOn: "warning",
    limitInputPixels: 20_000_000,
  }).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("The uploaded image is invalid.");
  const bytes = await sharp(input)
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#17151f" })
    .webp({ quality: 78 })
    .toBuffer();
  return {
    ephemeralData: `data:image/webp;base64,${bytes.toString("base64")}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mime: "image/webp",
    width: metadata.width,
    height: metadata.height,
  };
}
