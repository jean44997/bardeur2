import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, UserPlus, Video, Share2, AtSign, Bell, Filter, MoonStar, CheckCheck, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  allowsNotificationType,
  getMotionTier,
  getNotificationSound,
  isDndActive,
  isQuietHoursNow,
  playNotificationCue,
} from "@/lib/notificationPrefs";
import type { NotificationType } from "@/lib/notificationPrefs";

interface NotificationItem {
  id: string;
  type: string;
  content: string;
  from_username: string;
  is_read: boolean;
  created_at: string;
  reference_id?: string | null;
  group_count?: number;
  group_ids?: string[];
}

const typeIcons: Record<string, any> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  mention: AtSign,
  video: Video,
  share: Share2,
  message: MessageCircle,
};

const FILTERS: [NotificationType, string][] = [
  ["all", "Tout"],
  ["like", "J'aime"],
  ["comment", "Commentaires"],
  ["follow", "Abonnements"],
  ["mention", "Mentions"],
  ["share", "Partages"],
  ["message", "Messages"],
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user, profile, updateProfile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<NotificationType>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const lastCueRef = useRef(0);
  const tier = useMemo(() => getMotionTier(), []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*, from_profile:from_user_id(username)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120);

    if (data) {
      setNotifications(
        data.map((n: any) => ({
          id: n.id,
          type: n.type,
          content: n.content,
          from_username: n.from_profile?.username || "quelqu'un",
          is_read: n.is_read,
          created_at: n.created_at,
          reference_id: n.reference_id,
        }))
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications-center-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          fetchNotifications();
          const incoming = payload.new as NotificationItem;
          const type = (incoming?.type || "all") as NotificationType;
          const now = Date.now();
          const allowed = allowsNotificationType(profile, type) && !isDndActive(profile);
          if (profile?.sound_notifications && allowed && now - lastCueRef.current > 2500) {
            lastCueRef.current = now;
            playNotificationCue(getNotificationSound(profile));
            if (navigator.vibrate) navigator.vibrate(18);
          }
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && allowed) {
            new Notification("BARDEUR", { body: incoming?.content || "Nouvelle notification", tag: incoming?.reference_id || incoming?.id });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const markAllRead = async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    toast.success("Historique marqué comme lu");
  };

  const markGroupRead = async (item: NotificationItem) => {
    const ids = item.group_ids?.length ? item.group_ids : [item.id];
    setNotifications(prev => prev.map(n => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
  };

  const toggleDnd = async () => {
    const active = (profile as any)?.dnd_until && new Date((profile as any).dnd_until).getTime() > Date.now();
    const value = active ? null : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { error } = await updateProfile({ dnd_until: value } as any);
    if (error) toast.error("Impossible de changer le mode Ne pas déranger");
    else toast.success(active ? "Ne pas déranger désactivé" : "Ne pas déranger activé pour 2h (tous tes appareils)");
  };

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.is_read) await markGroupRead(item);

    if (item.type === "message" && item.reference_id) {
      navigate(`/chat/${item.reference_id}`);
      return;
    }
    if (item.from_username && item.from_username !== "quelqu'un") {
      navigate(`/profile/${item.from_username}`);
    }
  };

  const groupedNotifications = useMemo(() => {
    let source = activeFilter === "all" ? notifications : notifications.filter((n) => n.type === activeFilter);
    if (unreadOnly) source = source.filter((n) => !n.is_read);
    const groups = new Map<string, NotificationItem>();

    source.forEach((notification) => {
      const bucket = Math.floor(new Date(notification.created_at).getTime() / (10 * 60 * 1000));
      const key = `${notification.type}:${notification.reference_id || notification.from_username}:${bucket}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { ...notification, group_count: 1, group_ids: [notification.id] });
        return;
      }
      groups.set(key, {
        ...existing,
        is_read: existing.is_read && notification.is_read,
        group_count: (existing.group_count || 1) + 1,
        group_ids: [...(existing.group_ids || []), notification.id],
        created_at: new Date(notification.created_at) > new Date(existing.created_at) ? notification.created_at : existing.created_at,
      });
    });

    return Array.from(groups.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeFilter, notifications, unreadOnly]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const dndOn = isDndActive(profile);

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "maintenant";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}j`;
  };

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="md:hidden" aria-label="Retour">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-foreground">Centre de notifications</h1>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"}
              {isQuietHoursNow(profile) ? " · heures calmes actives" : ""}
            </p>
          </div>
          <button onClick={() => navigate("/settings")} className="rounded-full bg-card p-2 text-muted-foreground" aria-label="Préférences de notification">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={toggleDnd}
            className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-bold ${dndOn ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}
          >
            <MoonStar className="h-4 w-4" />
            {dndOn ? "Ne pas déranger ON" : "Ne pas déranger"}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex items-center justify-center gap-2 rounded-2xl glass px-3 py-2.5 text-xs font-bold text-foreground disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4 text-primary" />
            Tout marquer lu
          </motion.button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${activeFilter === key ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}
            >
              {key === "all" && <Filter className="h-3 w-3" />}
              {label}
            </button>
          ))}
          <button
            onClick={() => setUnreadOnly(v => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${unreadOnly ? "bg-primary/20 text-primary" : "glass text-muted-foreground"}`}
          >
            Non lues
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : groupedNotifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Aucune notification ici</p>
          </div>
        ) : (
          <div className="space-y-1" style={{ perspective: tier === "low" ? undefined : 900 }}>
            {groupedNotifications.map((n, i) => {
              const Icon = typeIcons[n.type] || Bell;
              return (
                <motion.button
                  key={`${n.id}-${n.group_count}`}
                  initial={tier === "low" ? { opacity: 0 } : { opacity: 0, y: 10, rotateX: -18 }}
                  animate={tier === "low" ? { opacity: 1 } : { opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: Math.min(i, 8) * (tier === "low" ? 0.01 : 0.025), type: tier === "low" ? "tween" : "spring", stiffness: 300, damping: 26 }}
                  onClick={() => handleOpenNotification(n)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${!n.is_read ? "bg-primary/5" : "hover:bg-card"}`}
                  style={{ willChange: "transform, opacity" }}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-card">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">@{n.from_username}</span>{" "}
                      <span className="text-muted-foreground">{n.content}</span>
                      {(n.group_count || 0) > 1 && <span className="ml-1 font-bold text-primary">x{n.group_count}</span>}
                    </p>
                    <span className="text-[11px] text-muted-foreground">{getTimeAgo(n.created_at)}</span>
                  </div>
                  {!n.is_read && <div className="h-2 w-2 rounded-full gradient-primary flex-shrink-0" />}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
