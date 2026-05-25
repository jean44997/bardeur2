const PREFIX = "bdenc:v1";
const SALT = "bardeur-basic-message-key";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getKey(scope: string) {
  const seed = new TextEncoder().encode(`${SALT}:${scope}`);
  const digest = await crypto.subtle.digest("SHA-256", seed);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function isEncryptedContent(content?: string | null) {
  return typeof content === "string" && content.startsWith(`${PREFIX}:`);
}

export async function encryptMessageContent(content: string, conversationId: string) {
  if (!content || typeof crypto === "undefined" || !crypto.subtle) return content;

  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getKey(conversationId);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(content),
    );

    return `${PREFIX}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
  } catch {
    return content;
  }
}

export async function decryptMessageContent(content: string | null | undefined, conversationId: string) {
  if (!content || !isEncryptedContent(content) || typeof crypto === "undefined" || !crypto.subtle) return content || "";

  try {
    const [, , ivValue, encryptedValue] = content.split(":");
    if (!ivValue || !encryptedValue) return content;
    const key = await getKey(conversationId);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivValue) },
      key,
      base64ToBytes(encryptedValue),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return content;
  }
}
