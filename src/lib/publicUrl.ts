/**
 * Public site URL helper.
 * - Reads VITE_PUBLIC_SITE_URL when set (custom domain), falls back to the published bardeur2 URL.
 * - Never points to lovable.dev / lovable.app preview hosts (strict project rule).
 */
const FALLBACK = "https://bardeur2.lovable.app";

function rawBase(): string {
  const env = (import.meta as any)?.env?.VITE_PUBLIC_SITE_URL as string | undefined;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/$/, "");
  // If we're running on a non-lovable host (custom domain in browser), trust it.
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "";
    if (host && !/lovable\.(app|dev|project)/i.test(host) && host !== "localhost") {
      return `${window.location.protocol}//${window.location.host}`;
    }
  }
  return FALLBACK;
}

export function getPublicUrl(path = "/"): string {
  const base = rawBase();
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

export function getProfileUrl(username: string): string {
  return getPublicUrl(`/profile/${encodeURIComponent(username)}`);
}

export function getVideoUrl(videoId: string): string {
  return getPublicUrl(`/?v=${encodeURIComponent(videoId)}`);
}
