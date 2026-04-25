/**
 * Mini client-side buffer that prefetches the latest frame and the next few
 * audio chunks so the mini player and resume actions are instant even on
 * unstable mobile/iOS networks.
 */
export class LivePrebuffer {
  private images: HTMLImageElement[] = [];
  private audioCache = new Map<string, ArrayBuffer>();
  private maxImages = 2;
  private maxAudio = 3;

  configure({ images, audio }: { images?: number; audio?: number }) {
    if (typeof images === "number") this.maxImages = Math.max(1, Math.min(4, images));
    if (typeof audio === "number") this.maxAudio = Math.max(2, Math.min(8, audio));
    this.images = this.images.slice(0, this.maxImages);
    while (this.audioCache.size > this.maxAudio) {
      const firstKey = this.audioCache.keys().next().value as string | undefined;
      if (!firstKey) break;
      this.audioCache.delete(firstKey);
    }
  }

  prefetchFrame(url: string) {
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    this.images.unshift(img);
    this.images = this.images.slice(0, this.maxImages);
  }

  async prefetchAudio(url: string) {
    if (this.audioCache.has(url)) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      this.audioCache.set(url, buf);
      // Trim oldest entries
      if (this.audioCache.size > this.maxAudio) {
        const firstKey = this.audioCache.keys().next().value as string | undefined;
        if (firstKey) this.audioCache.delete(firstKey);
      }
    } catch {
      // ignore network jitter
    }
  }

  hasAudio(url: string) {
    return this.audioCache.has(url);
  }

  stats() {
    return { images: this.images.length, audio: this.audioCache.size, maxImages: this.maxImages, maxAudio: this.maxAudio };
  }

  reset() {
    this.images = [];
    this.audioCache.clear();
  }
}
