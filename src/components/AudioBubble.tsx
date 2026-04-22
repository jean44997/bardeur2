import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Volume2 } from "lucide-react";

interface AudioBubbleProps {
  src: string;
  compact?: boolean;
}

export default function AudioBubble({ src, compact = false }: AudioBubbleProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
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
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="min-w-[210px] max-w-full rounded-2xl bg-background/30 px-3 py-2 shadow-sm">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? (e.currentTarget.currentTime / e.currentTarget.duration) * 100 : 0)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <div className="flex items-center gap-2">
        <motion.button whileTap={{ scale: 0.9 }} onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </motion.button>
        <div className="flex min-w-0 flex-1 items-end gap-0.5">
          {Array.from({ length: compact ? 16 : 24 }).map((_, i) => (
            <span key={i} className="w-1 rounded-full bg-foreground/70" style={{ height: 8 + ((i * 7) % 18), opacity: i < (progress / 100) * (compact ? 16 : 24) ? 1 : 0.35 }} />
          ))}
        </div>
        <span className="w-9 text-right text-[10px] tabular-nums text-foreground/70">{fmt(duration)}</span>
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-2">
          <Volume2 className="h-3 w-3 text-foreground/60" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 flex-1 accent-primary"
            aria-label="Volume du vocal"
          />
        </div>
      )}
    </div>
  );
}