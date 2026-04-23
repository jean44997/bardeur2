export function extractLiveTags(title?: string | null) {
  if (!title) return [] as string[];

  return Array.from(
    new Set(
      title
        .split(/[^\p{L}\p{N}#]+/u)
        .map((part) => part.replace(/^#/, "").trim().toLowerCase())
        .filter((part) => part.length >= 2),
    ),
  ).slice(0, 6);
}

export function formatRecorderTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}