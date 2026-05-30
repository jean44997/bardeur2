import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
  markClassName?: string;
}

/**
 * BYK monogram – minimal, premium, no childish gradients.
 * Black squircle, single thin accent stroke, sharp "B" mark with a YK suffix.
 */
export default function AppLogo({ className, markClassName }: AppLogoProps) {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-[28%] bg-[#0a0a0c] shadow-[0_8px_28px_-12px_rgba(255,51,153,0.45)] ring-1 ring-white/10",
        className,
      )}
      aria-label="BARDEUR YK"
    >
      {/* Subtle pink-to-cyan accent arc, very faint */}
      <div className="pointer-events-none absolute -left-1/3 -top-1/3 h-[160%] w-[160%] rotate-[18deg] bg-[conic-gradient(from_220deg,transparent_0deg,rgba(255,51,153,.35)_70deg,rgba(0,212,255,.28)_140deg,transparent_220deg)] opacity-60 blur-2xl" />
      {/* Hairline frame */}
      <div className="absolute inset-[8%] rounded-[22%] border border-white/8" />

      <svg
        viewBox="0 0 64 64"
        className={cn("relative h-[62%] w-[62%] drop-shadow-[0_1px_0_rgba(0,0,0,.6)]", markClassName)}
        aria-hidden
      >
        <defs>
          <linearGradient id="bykStroke" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ffd6e7" />
          </linearGradient>
        </defs>
        {/* B shape */}
        <path
          d="M14 10 H30 a10 10 0 0 1 0 20 H14 Z M14 30 H32 a11 11 0 0 1 0 22 H14 Z"
          fill="url(#bykStroke)"
        />
        {/* YK micro-mark */}
        <text
          x="42"
          y="50"
          fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
          fontWeight="900"
          fontSize="14"
          letterSpacing="-0.04em"
          fill="#ffffff"
          opacity="0.92"
        >
          YK
        </text>
        {/* Bottom accent dot */}
        <circle cx="48" cy="14" r="2.6" fill="#ff3399" />
      </svg>
    </div>
  );
}
