export type TextValidationOptions = {
  maxLength: number;
  minLength?: number;
  allowLinks?: boolean;
};

export type TextValidationResult = {
  ok: boolean;
  value: string;
  reason?: string;
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TOO_MANY_REPEATS = /(.)\1{10,}/;
const SUSPICIOUS_LINKS = /(https?:\/\/|www\.|t\.me\/|bit\.ly\/|tinyurl\.com\/|discord\.gg\/)/i;
const RISKY_TERMS = /\b(seed phrase|airdrop|wallet connect|free nitro|double your money|mot de passe|code otp|carte bancaire)\b/i;

export function normalizeUserText(input: string, maxLength = 500) {
  return input
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function validateUserText(input: string, options: TextValidationOptions): TextValidationResult {
  const value = normalizeUserText(input, options.maxLength + 20);
  const minLength = options.minLength ?? 1;

  if (value.length < minLength) {
    return { ok: false, value, reason: "Message trop court" };
  }

  if (value.length > options.maxLength) {
    return { ok: false, value: value.slice(0, options.maxLength), reason: `Maximum ${options.maxLength} caractères` };
  }

  if (TOO_MANY_REPEATS.test(value)) {
    return { ok: false, value, reason: "Répétition détectée" };
  }

  if (!options.allowLinks && SUSPICIOUS_LINKS.test(value)) {
    return { ok: false, value, reason: "Liens désactivés ici pour limiter le spam" };
  }

  if (RISKY_TERMS.test(value)) {
    return { ok: false, value, reason: "Contenu sensible bloqué par sécurité" };
  }

  return { ok: true, value };
}

export function looksLikeRepeatedSpam(text: string, recentMessages: string[], threshold = 3) {
  const normalized = normalizeUserText(text, 500).toLowerCase();
  if (!normalized) return false;
  return recentMessages.filter((message) => normalizeUserText(message, 500).toLowerCase() === normalized).length >= threshold;
}

export function validateUploadFile(
  file: File,
  {
    maxBytes,
    acceptedPrefixes,
  }: {
    maxBytes: number;
    acceptedPrefixes: string[];
  },
) {
  if (file.size > maxBytes) {
    return { ok: false, reason: `Fichier trop volumineux (max ${Math.floor(maxBytes / 1024 / 1024)}MB)` };
  }

  if (!acceptedPrefixes.some((prefix) => file.type.startsWith(prefix))) {
    return { ok: false, reason: "Format de fichier non autorisé" };
  }

  return { ok: true };
}

export function sanitizeHashtags(input: string, maxTags = 12) {
  const seen = new Set<string>();
  return input
    .split(/[#,\s]+/)
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9_\u00C0-\u017F-]/gi, ""))
    .filter(Boolean)
    .filter((tag) => {
      if (tag.length > 32 || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, maxTags);
}
