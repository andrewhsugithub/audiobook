import type { UploadPart } from "@audiobook/shared-libs/types/index";

/** Normalise camelCase `{ partNumber, etag }` → PascalCase `{ PartNumber, ETag }` and sort ascending */
export function normalizeParts(
  parts: UploadPart[],
): { PartNumber: number; ETag: string }[] {
  return parts
    .map((p) => ({
      PartNumber: p.PartNumber ?? p.partNumber,
      ETag: p.ETag ?? p.etag,
    }))
    .filter(
      (p): p is { PartNumber: number; ETag: string } =>
        typeof p.PartNumber === "number" &&
        typeof p.ETag === "string" &&
        p.ETag.length > 0,
    )
    .sort((a, b) => a.PartNumber - b.PartNumber);
}
