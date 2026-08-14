import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, MessageCircle, UserPlus, Share2, AtSign, Bell, MoonStar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  allowsNotificationType,
  frequencyThrottleMs,
  getMotionTier,
  getNotificationSound,
  isDndActive,
  playNotificationCue,
} from "@/lib/notificationPrefs";
import type { NotificationType } from "@/lib/notificationPrefs";

interface Bubble {
  key: string;
  type: string;
  from: string;
  content: string;
  count: number;
  referenceId?: string | null;
  createdAt: number;
}

const icons: Record<string, any> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  share: Share2,
  mention: AtSign,
};

const GROUP_WINDOW_MS = 90_000;

/**
 * Global 3D notification bubbles (likes, comments, follows...).
 * - Realtime + cross-device: driven by the `notifications` table.
 * - Smart grouping: same type + same author within 90s stack into one bubble ("x3").
 * - Adaptive: on low-tier devices we drop the 3D rotation/blur, show fewer bubbles
 *   and slow down the sweep loop to stay at 60fps.
 */
export default function NotificationBubbles3D() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const lastCueRef = useRef(0);
  const lastBubbleRef = useRef(0);
  const mountedAtRef = useRef(Date.now());
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const tier = useMemo(() => getMotionTier(), []);
  const maxBubbles = tier === "low" ? 2 : 3;
  const lifetimeMs = tier === "low" ? 5000 : 6500;
  const sweepMs = tier === "low" ? 1200 : 700;

  const usernameCache = useRef(new Map<string, string>());
  // Keep a ref copy so the realtime callback can read bubbles without re-subscribing.
  const bubblesRef = useRef<Bubble[]>([]);
  bubblesRef.current = bubbles;

  const resolveUsername = useCallback(async (id?: string | null) => {
    if (!id) return "quelqu'un";
    const cached = usernameCache.current.get(id);
    if (cached) return cached;
    const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
    const name = data?.username || "quelqu'un";
    usernameCache.current.set(id, name);
    return name;
  }, []);

  useEffect(() => {
    if (!user) { setBubbles([]); return; }
    mountedAtRef.current = Date.now();

    const channel = supabase
      .channel(`global-notif-bubbles-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const row: any = payload.new;
          if (!row) return;
          const current = profileRef.current;
          const type = (row.type || "all") as NotificationType;
          if (type === "message") return; // handled by the inbox/chat surfaces
          if (!allowsNotificationType(current, type)) return;
          if (isDndActive(current)) return;
          if (new Date(row.created_at).getTime() < mountedAtRef.current - 15000) return;

          const groupKey = `${row.type}:${row.from_user_id || "system"}`;
          const now = Date.now();
          const throttle = frequencyThrottleMs(current);
          const isGrouped = bubblesRef.current.some((b) => b.key === groupKey && now - b.createdAt < GROUP_WINDOW_MS);
          if (!isGrouped && now - lastBubbleRef.current < throttle) return;

          const from = await resolveUsername(row.from_user_id);

          setBubbles((prev) => {
            const existing = prev.find((b) => b.key === groupKey && Date.now() - b.createdAt < GROUP_WINDOW_MS);
            if (existing) {
              return prev.map((b) =>
                b.key === groupKey ? { ...b, count: b.count + 1, createdAt: Date.now(), content: row.content || b.content } : b
              );
            }
            const next: Bubble = {
              key: groupKey,
              type: row.type,
              from,
              content: row.content || "Nouvelle activité",
              count: 1,
              referenceId: row.reference_id,
              createdAt: Date.now(),
            };
            return [next, ...prev].slice(0, maxBubbles);
          });
          lastBubbleRef.current = now;

          if (current?.sound_notifications && now - lastCueRef.current > Math.min(throttle, 4000)) {
            lastCueRef.current = now;
            playNotificationCue(getNotificationSound(current));
            if (navigator.vibrate) navigator.vibrate(tier === "low" ? 10 : 14);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, maxBubbles, tier, resolveUsername]);

  // Auto-dismiss expired bubbles (paused when the tab is hidden to save battery).
  useEffect(() => {
    if (!bubbles.length) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setBubbles((prev) => prev.filter((b) => Date.now() - b.createdAt < lifetimeMs));
    }, sweepMs);
    return () => window.clearInterval(timer);
  }, [bubbles.length, lifetimeMs, sweepMs]);

  const open = (bubble: Bubble) => {
    setBubbles((prev) => prev.filter((b) => b.key !== bubble.key));
    navigate("/notifications");
  };

  const list = useMemo(() => bubbles.slice(0, maxBubbles), [bubbles, maxBubbles]);
  if (!user || !list.length) return null;

  const dnd = isDndActive(profile);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-3"
      style={{ top: "calc(var(--app-safe-top, 0px) + 0.6rem)", perspective: tier === "low" ? undefined : 1000 }}
    >
      <AnimatePresence initial={false}>
        {list.map((b, i) => {
          const Icon = dnd ? MoonStar : icons[b.type] || Bell;
          return (
            <motion.button
              key={b.key}
              type="button"
              onClick={() => open(b)}
              initial={tier === "low" ? { opacity: 0, y: -14 } : { opacity: 0, y: -26, rotateX: -55, scale: 0.9 }}
              animate={tier === "low" ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, rotateX: 0, scale: 1 - i * 0.03 }}
              exit={tier === "low" ? { opacity: 0, y: -10 } : { opacity: 0, y: -18, rotateX: 40, scale: 0.92 }}
              transition={tier === "low" ? { duration: 0.18, ease: "easeOut" } : { type: "spring", stiffness: 320, damping: 24 }}
              whileTap={{ scale: 0.96 }}
              className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border/60 bg-card/85 px-3 py-2.5 text-left shadow-2xl ${tier === "low" ? "" : "backdrop-blur-xl"}`}
              style={tier === "low" ? { willChange: "transform, opacity" } : { transformStyle: "preserve-3d", willChange: "transform, opacity" }}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-primary text-primary-foreground shadow-lg">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">@{b.from}</span>
                <span className="block truncate text-xs text-muted-foreground">{b.content}</span>
              </span>
              {b.count > 1 && (
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">x{b.count}</span>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
