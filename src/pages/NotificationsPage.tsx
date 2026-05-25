import { useMemo, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, UserPlus, Video, Share2, AtSign, Bell, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { allowsNotificationType, getNotificationSound, isQuietHoursNow, playNotificationCue } from "@/lib/notificationPrefs";
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

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<NotificationType>("all");
  const lastCueRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          fetchNotifications();
          const incoming = payload.new as NotificationItem;
          const type = (incoming?.type || "all") as NotificationType;
          const now = Date.now();
          if (profile?.sound_notifications && allowsNotificationType(profile, type) && !isQuietHoursNow(profile) && now - lastCueRef.current > 2500) {
            lastCueRef.current = now;
            playNotificationCue(getNotificationSound(profile));
            if (navigator.vibrate) navigator.vibrate(18);
          }
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && allowsNotificationType(profile, type) && !isQuietHoursNow(profile)) {
            new Notification("BARDEUR", { body: incoming?.content || "Nouvelle notification", tag: incoming?.reference_id || incoming?.id });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*, from_profile:from_user_id(username)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

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
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.is_read) await markOneRead(item.id);

    if (item.type === "message" && item.reference_id) {
      navigate(`/chat/${item.reference_id}`);
      return;
    }

    if (item.from_username) {
      navigate(`/profile/${item.from_username}`);
    }
  };

  const groupedNotifications = useMemo(() => {
    const source = activeFilter === "all" ? notifications : notifications.filter((n) => n.type === activeFilter);
    const groups = new Map<string, NotificationItem>();

    source.forEach((notification) => {
      const bucket = Math.floor(new Date(notification.created_at).getTime() / (10 * 60 * 1000));
      const key = `${notification.type}:${notification.reference_id || notification.from_username}:${bucket}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { ...notification, group_count: 1 });
        return;
      }
      groups.set(key, {
        ...existing,
        is_read: existing.is_read && notification.is_read,
        group_count: (existing.group_count || 1) + 1,
        created_at: new Date(notification.created_at) > new Date(existing.created_at) ? notification.created_at : existing.created_at,
      });
    });

    return Array.from(groups.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeFilter, notifications]);

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
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="md:hidden">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <h1 className="text-xl font-bold text-foreground">Notifications</h1>
          {notifications.some(n => !n.is_read) && (
            <button onClick={markAllRead} className="ml-auto text-xs text-primary font-semibold">Tout marquer comme lu</button>
          )}
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            ["all", "Tout"],
            ["message", "Messages"],
            ["like", "J'aime"],
            ["comment", "Commentaires"],
            ["follow", "Abonnés"],
            ["share", "Partages"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key as NotificationType)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${activeFilter === key ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}
            >
              {key === "all" && <Filter className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : groupedNotifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Aucune notification pour le moment</p>
          </div>
        ) : (
          <div className="space-y-1">
            {groupedNotifications.map((n, i) => {
              const Icon = typeIcons[n.type] || Bell;
              return (
                <motion.button
                  key={n.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handleOpenNotification(n)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${!n.is_read ? "bg-primary/5" : "hover:bg-card"}`}
                >
                  <div className="h-10 w-10 rounded-full bg-card flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">@{n.from_username}</span>{" "}
                      <span className="text-muted-foreground">{n.content}</span>
                      {(n.group_count || 0) > 1 && <span className="ml-1 text-primary">x{n.group_count}</span>}
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
