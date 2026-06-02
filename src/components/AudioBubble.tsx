import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Volume2 } from "lucide-react";

interface AudioBubbleProps {
  src: string;
  compact?: boolean;
}

export default function AudioBubble({ src, compact = false }: AudioBubbleProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [buffered, setBuffered] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.preload = "auto";
  }, [volume]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      audio.volume = volume;
      if (!audio.duration || Number.isNaN(audio.duration)) {
        try { audio.load(); } catch {}
      }
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const seekFromClientX = (clientX: number) => {
    const bar = barRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !audio.duration || Number.isNaN(audio.duration)) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio * 100);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    seekFromClientX(e.clientX);
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!scrubbing) return;
    seekFromClientX(e.clientX);
  };
  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = () => setScrubbing(false);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  const bars = compact ? 16 : 24;

  return (
    <div className="min-w-[210px] max-w-full rounded-2xl bg-background/30 px-3 py-2 shadow-sm">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        crossOrigin="anonymous"
        playsInline
        // @ts-ignore — iOS Safari hint
        webkit-playsinline="true"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onProgress={(e) => {
          const audio = e.currentTarget;
          if (audio.duration && audio.buffered.length) {
            setBuffered((audio.buffered.end(audio.buffered.length - 1) / audio.duration) * 100);
          }
        }}
        onTimeUpdate={(e) => {
          if (scrubbing) return;
          setProgress(e.currentTarget.duration ? (e.currentTarget.currentTime / e.currentTarget.duration) * 100 : 0);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onError={() => setPlaying(false)}
      />
      <div className="flex items-center gap-2">
        <motion.button whileTap={{ scale: 0.9 }} onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </motion.button>
        <div
          ref={barRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative flex min-w-0 flex-1 cursor-pointer touch-none items-end gap-0.5 py-1"
          role="slider"
          aria-label="Position de lecture"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          {Array.from({ length: bars }).map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-foreground/70 pointer-events-none transition-opacity"
              style={{ height: 8 + ((i * 7) % 18), opacity: i < (progress / 100) * bars ? 1 : 0.35 }}
            />
          ))}
          <span
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow ring-2 ring-background"
            style={{ left: `${progress}%`, opacity: scrubbing ? 1 : 0.85 }}
          />
        </div>
        <span className="w-9 text-right text-[10px] tabular-nums text-foreground/70">{fmt(duration)}</span>
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-2">
          <Volume2 className="h-3 w-3 text-foreground/60" />
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 left-0 bg-muted-foreground/30" style={{ width: `${buffered}%` }} />
            <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 w-20 accent-primary"
            aria-label="Volume du vocal"
          />
        </div>
      )}
    </div>
  );
}
