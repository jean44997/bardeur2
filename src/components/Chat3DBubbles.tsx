import { motion, AnimatePresence } from "framer-motion";
import { PhoneCall, Video, Keyboard, History } from "lucide-react";

// Ambient floating orbs — subtle 3D backdrop that can be reused across screens.
export function AmbientBubbles3D({ density = 6, className = "" }: { density?: number; className?: string }) {
  const bubbles = Array.from({ length: density }, (_, i) => i);
  const palette = [
    "from-fuchsia-500/30 via-primary/20 to-sky-500/20",
    "from-emerald-500/30 via-teal-500/20 to-cyan-500/20",
    "from-amber-400/30 via-rose-500/20 to-fuchsia-500/20",
    "from-indigo-500/30 via-sky-500/20 to-emerald-400/20",
  ];
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden style={{ perspective: 900 }}>
      {bubbles.map((i) => {
        const size = 90 + ((i * 37) % 140);
        const left = (i * 53) % 100;
        const top = (i * 29) % 100;
        const duration = 9 + (i % 5);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{
              opacity: [0.35, 0.7, 0.35],
              y: [0, -18, 0],
              x: [0, i % 2 ? 12 : -12, 0],
              rotateX: [0, 12, 0],
              rotateY: [0, -8, 0],
              scale: [0.9, 1.05, 0.9],
            }}
            transition={{ duration, repeat: Infinity, ease: "easeInOut", delay: i * 0.35 }}
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, transformStyle: "preserve-3d" }}
            className={`absolute rounded-full bg-gradient-to-br ${palette[i % palette.length]} blur-2xl`}
          />
        );
      })}
    </div>
  );
}

// Persistent summary chip that lists the most recent typers during active presence.
export function RecentTypersBubble3D({ typers, activeCount }: { typers: { userId: string; name: string; ts: number }[]; activeCount: number }) {
  if (activeCount > 0 || typers.length === 0) return null;
  const label = typers.slice(0, 3).map((t) => t.name.split(" ")[0]).join(", ");
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 0.9, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2"
      style={{ perspective: 700 }}
    >
      <div
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-background/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] backdrop-blur-md"
        style={{ transform: "translateZ(0)" }}
      >
        <History className="h-3 w-3 opacity-70" />
        <span className="max-w-[55vw] truncate">Récents: {label}{typers.length > 3 ? ` +${typers.length - 3}` : ""}</span>
      </div>
    </motion.div>
  );
}

// Small 3D-looking floating bubble used to show group typing activity.
export function TypingBubble3D({ names }: { names: string[] }) {
  const label = names.length === 0
    ? null
    : names.length === 1
      ? `${names[0]} écrit…`
      : names.length === 2
        ? `${names[0]} et ${names[1]} écrivent…`
        : `${names[0]}, ${names[1]} +${names.length - 2} écrivent…`;
  return (
    <AnimatePresence>
      {label && (
        <motion.div
          initial={{ opacity: 0, y: 14, rotateX: -30, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="pointer-events-none absolute bottom-24 left-1/2 z-40 -translate-x-1/2"
          style={{ perspective: 800 }}
        >
          <div
            className="flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-br from-fuchsia-500/90 via-primary/90 to-sky-500/90 px-4 py-2 text-xs font-semibold text-white shadow-[0_20px_50px_-15px_rgba(236,72,153,0.6),0_10px_30px_-20px_rgba(59,130,246,0.6)] backdrop-blur"
            style={{ transform: "translateZ(0)" }}
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span className="max-w-[60vw] truncate">{label}</span>
            <span className="flex items-end gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }}
                  className="block h-1.5 w-1.5 rounded-full bg-white"
                />
              ))}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 3D pulsing bubble for an incoming group call ring.
export function IncomingCallBubble3D({
  visible,
  name,
  type,
  onAccept,
  onDismiss,
}: {
  visible: boolean;
  name: string;
  type: "audio" | "video";
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -30, rotateX: 45, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-[60] w-[min(92vw,380px)] -translate-x-1/2"
          style={{ perspective: 1000 }}
        >
          <motion.div
            animate={{ boxShadow: [
              "0 20px 60px -20px rgba(16,185,129,0.55), 0 0 0 0 rgba(16,185,129,0.5)",
              "0 20px 60px -20px rgba(59,130,246,0.55), 0 0 0 18px rgba(59,130,246,0)",
              "0 20px 60px -20px rgba(16,185,129,0.55), 0 0 0 0 rgba(16,185,129,0.5)",
            ] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/95 via-teal-500/95 to-sky-500/95 p-3 text-white backdrop-blur"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="grid h-11 w-11 place-items-center rounded-full bg-white/15"
            >
              {type === "video" ? <Video className="h-5 w-5" /> : <PhoneCall className="h-5 w-5" />}
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-widest opacity-80">Appel groupe entrant</p>
              <p className="truncate text-sm font-semibold">{name}</p>
            </div>
            <button
              onClick={onDismiss}
              className="rounded-full bg-black/25 px-3 py-1.5 text-xs font-semibold hover:bg-black/40 transition"
            >
              Ignorer
            </button>
            <button
              onClick={onAccept}
              className="rounded-full bg-white text-emerald-600 px-3 py-1.5 text-xs font-bold shadow hover:bg-white/90 transition"
            >
              Rejoindre
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
