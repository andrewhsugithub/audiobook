export async function generateETag(data: unknown): Promise<string> {
  const json = JSON.stringify(data);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  );

  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `W/"${hash}"`;
}
