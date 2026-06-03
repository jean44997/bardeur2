import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Mic } from "lucide-react";

interface Props {
  src: string;
}

/**
 * Visuel dédié aux commentaires vocaux — volontairement différent de la bulle
 * des messages privés : disque tournant + onde pulsée + pill gradient.
 */
export default function CommentVoiceNote({ src }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState(false);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    try { a.load(); await a.play(); setPlaying(true); } catch { setPlaying(false); }
  };

  const seekAt = (clientX: number) => {
    const el = trackRef.current; const a = audioRef.current;
    if (!el || !a || !a.duration) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    a.currentTime = ratio * a.duration;
    setProgress(ratio * 100);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  // Generate stable pseudo-random wave heights from the src URL hash
  const heights = Array.from({ length: 28 }).map((_, i) => 6 + ((i * 31 + src.length * 7) % 14));

  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-full bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 px-2.5 py-1.5 ring-1 ring-primary/20">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        // @ts-ignore iOS
        webkit-playsinline="true"
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => { if (!scrub) setProgress(e.currentTarget.duration ? (e.currentTarget.currentTime / e.currentTarget.duration) * 100 : 0); }}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md"
        aria-label={playing ? "Pause" : "Lire le vocal"}
      >
        <motion.span
          className="absolute inset-0 rounded-full border border-primary-foreground/40"
          animate={playing ? { rotate: 360 } : { rotate: 0 }}
          transition={playing ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        />
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </motion.button>

      <div
        ref={trackRef}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setScrub(true); seekAt(e.clientX); }}
        onPointerMove={(e) => { if (scrub) seekAt(e.clientX); }}
        onPointerUp={() => setScrub(false)}
        onPointerCancel={() => setScrub(false)}
        className="relative flex h-7 min-w-[140px] flex-1 cursor-pointer touch-none items-center gap-[3px]"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        {heights.map((h, i) => {
          const active = i < (progress / 100) * heights.length;
          return (
            <motion.span
              key={i}
              className="w-[2.5px] rounded-full pointer-events-none"
              style={{ height: h, background: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.45)" }}
              animate={playing && active ? { scaleY: [1, 1.4, 1] } : { scaleY: 1 }}
              transition={{ duration: 0.6, repeat: playing && active ? Infinity : 0, delay: (i % 6) * 0.07 }}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-1 pl-1 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Mic className="h-3 w-3 text-primary" />
        <span className="tabular-nums">{fmt(duration)}</span>
      </div>
    </div>
  );
}
