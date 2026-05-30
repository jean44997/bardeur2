import { cn } from "@/lib/utils";

interface StoryRingProps {
  hasUnseen?: boolean;
  isOwn?: boolean;
  isLive?: boolean;
  size?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Gradient ring around an avatar – TikTok / IG story style.
 * Shows different states: unseen (vivid), seen (muted), live (red pulse).
 */
export default function StoryRing({ hasUnseen, isOwn, isLive, size = 64, className, children }: StoryRingProps) {
  const ring = isLive
    ? "bg-[conic-gradient(from_0deg,#ff2d55,#ff3399,#ff2d55)] animate-[pulseGlow_1.4s_ease-in-out_infinite_alternate]"
    : hasUnseen
      ? "bg-[conic-gradient(from_140deg,#ff3399,#ff8a3c,#00d4ff,#ff3399)]"
      : "bg-border";
  return (
    <div
      className={cn("relative grid place-items-center rounded-full p-[2px]", ring, className)}
      style={{ width: size, height: size }}
    >
      <div className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-background p-[2px]">
        <div className="grid h-full w-full place-items-center overflow-hidden rounded-full">
          {children}
        </div>
      </div>
      {isLive && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-destructive-foreground">
          Live
        </span>
      )}
      {isOwn && !hasUnseen && !isLive && (
        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-[2px] border-background bg-primary text-[11px] font-black text-primary-foreground">
          +
        </span>
      )}
    </div>
  );
}
