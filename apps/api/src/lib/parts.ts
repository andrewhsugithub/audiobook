import type {
  NormalisedPart,
  UploadPart,
} from "@audiobook/shared-libs/types/index";

export function normaliseParts(parts: UploadPart[]): NormalisedPart[] {
  return parts
    .map((p) => ({
      PartNumber: p.PartNumber ?? p.partNumber,
      ETag: p.ETag ?? p.etag,
    }))
    .filter(
      (p): p is NormalisedPart =>
        typeof p.PartNumber === "number" &&
        typeof p.ETag === "string" &&
        p.ETag.length > 0,
    )
    .sort((a, b) => a.PartNumber - b.PartNumber);
}
