/**
 * Sequenced audio queue: ensures live audio chunks play one after another
 * without overlap, with deduplication by sequence number, and graceful
 * handling of network jitter/skips. Older chunks are dropped if a newer one
 * arrives before playback can catch up.
 */
export class LiveAudioQueue {
  private queue: Array<{ seq: number; url: string }> = [];
  private playing = false;
  private lastSeq = -1;
  private muted = false;
  private maxBacklog = 3;
  private current: HTMLAudioElement | null = null;

  setMuted(value: boolean) {
    this.muted = value;
    if (value && this.current) {
      try { this.current.pause(); } catch { /* noop */ }
    }
  }

  enqueue(seq: number, url: string) {
    if (this.muted) return;
    if (typeof seq !== "number") seq = Date.now();
    if (seq <= this.lastSeq) return; // dedupe / out-of-order
    this.queue.push({ seq, url });
    // Keep only the freshest items if we are falling behind
    if (this.queue.length > this.maxBacklog) {
      this.queue = this.queue.slice(-this.maxBacklog);
    }
    this.queue.sort((a, b) => a.seq - b.seq);
    this.tick();
  }

  private async tick() {
    if (this.playing) return;
    const item = this.queue.shift();
    if (!item) return;
    this.playing = true;
    this.lastSeq = item.seq;
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = item.url;
    audio.crossOrigin = "anonymous";
    this.current = audio;
    const cleanup = () => {
      this.playing = false;
      this.current = null;
      // Drop everything older than what we just played
      this.queue = this.queue.filter((q) => q.seq > this.lastSeq);
      this.tick();
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    try {
      await audio.play();
    } catch {
      cleanup();
    }
  }

  reset() {
    this.queue = [];
    this.playing = false;
    if (this.current) {
      try { this.current.pause(); } catch { /* noop */ }
    }
    this.current = null;
  }
}
