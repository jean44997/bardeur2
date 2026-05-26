import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
  markClassName?: string;
}

export default function AppLogo({ className, markClassName }: AppLogoProps) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl shadow-primary/20", className)} aria-label="BARDEUR YK">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(0,212,255,.45),transparent_28%),linear-gradient(135deg,rgba(255,51,153,.95),rgba(0,212,255,.88))]" />
      <div className="absolute inset-[10%] rounded-[1rem] border border-white/20 bg-black/28 backdrop-blur-[2px]" />
      <div className={cn("relative flex items-end gap-0.5 font-black tracking-tight text-white", markClassName)}>
        <span className="text-[1.15em] leading-none">B</span>
        <span className="mb-[0.08em] h-[0.72em] w-[0.18em] rounded-full bg-white/90" />
        <span className="mb-[0.02em] text-[0.68em] leading-none text-white/90">YK</span>
      </div>
    </div>
  );
}
