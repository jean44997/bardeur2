import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, MessageCircle, UserPlus, Share2, AtSign, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { allowsNotificationType, getNotificationSound, isQuietHoursNow, playNotificationCue } from "@/lib/notificationPrefs";
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

const LIFETIME_MS = 6500;

/**
 * Global 3D notification bubbles (likes, comments, follows...).
 * - Realtime + cross-device: driven by the `notifications` table, so any device
 *   of the same account renders the same bubble.
 * - Smart grouping: same type + same author within 60s stack into one bubble ("x3").
 */
export default function NotificationBubbles3D() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const lastCueRef = useRef(0);
  const mountedAtRef = useRef(Date.now());

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
          const type = (row.type || "all") as NotificationType;
          if (type === "message") return; // handled by the inbox/chat surfaces
          if (!allowsNotificationType(profile, type)) return;
          if (new Date(row.created_at).getTime() < mountedAtRef.current - 15000) return;

          let from = "quelqu'un";
          if (row.from_user_id) {
            const { data } = await supabase.from("profiles").select("username").eq("id", row.from_user_id).maybeSingle();
            if (data?.username) from = data.username;
          }

          const groupKey = `${row.type}:${row.from_user_id || from}`;
          setBubbles((prev) => {
            const existing = prev.find((b) => b.key === groupKey && Date.now() - b.createdAt < 60_000);
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
            return [next, ...prev].slice(0, 3);
          });

          const now = Date.now();
          if (profile?.sound_notifications && !isQuietHoursNow(profile) && now - lastCueRef.current > 2500) {
            lastCueRef.current = now;
            playNotificationCue(getNotificationSound(profile));
            if (navigator.vibrate) navigator.vibrate(14);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, profile?.sound_notifications]);

  // Auto-dismiss expired bubbles.
  useEffect(() => {
    if (!bubbles.length) return;
    const timer = window.setInterval(() => {
      setBubbles((prev) => prev.filter((b) => Date.now() - b.createdAt < LIFETIME_MS));
    }, 700);
    return () => window.clearInterval(timer);
  }, [bubbles.length]);

  const open = (bubble: Bubble) => {
    setBubbles((prev) => prev.filter((b) => b.key !== bubble.key));
    navigate("/inbox?tab=activity");
  };

  const list = useMemo(() => bubbles.slice(0, 3), [bubbles]);
  if (!user || !list.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-3"
      style={{ top: "calc(var(--app-safe-top, 0px) + 0.6rem)", perspective: 1000 }}
    >
      <AnimatePresence initial={false}>
        {list.map((b, i) => {
          const Icon = icons[b.type] || Bell;
          return (
            <motion.button
              key={b.key}
              type="button"
              onClick={() => open(b)}
              initial={{ opacity: 0, y: -26, rotateX: -55, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 - i * 0.03 }}
              exit={{ opacity: 0, y: -18, rotateX: 40, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              whileTap={{ scale: 0.96 }}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border/60 bg-card/85 px-3 py-2.5 text-left shadow-2xl backdrop-blur-xl"
              style={{ transformStyle: "preserve-3d" }}
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
