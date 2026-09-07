const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (content: string | ArrayBuffer) => {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return toHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));

  const { sha256 } = await import("@noble/hashes/sha2.js");
  return toHex(sha256(bytes));
};
