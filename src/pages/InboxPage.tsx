import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, AtSign, Bell, CheckCircle2, Heart, MessageCircle, Pin, Search, Share2, ShieldCheck, UserPlus, Video } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { decryptMessageContent, isEncryptedContent } from "@/lib/messageCrypto";
import { allowsNotificationType, getNotificationSound, isQuietHoursNow, playNotificationCue } from "@/lib/notificationPrefs";
import type { NotificationType } from "@/lib/notificationPrefs";

interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  pinned: boolean;
  archived: boolean;
  request: boolean;
  admin: boolean;
}

interface InboxNotification {
  id: string;
  type: string;
  content: string;
  from_username: string;
  is_read: boolean;
  created_at: string;
  reference_id?: string | null;
}

type InboxTab = "all" | "pinned" | "activity" | "requests" | "archived";

const notificationIcons: Record<string, any> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  mention: AtSign,
  video: Video,
  share: Share2,
  message: MessageCircle,
};

export default function InboxPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<InboxTab>((searchParams.get("tab") as InboxTab) || "all");
  const [notificationFilter, setNotificationFilter] = useState<NotificationType>("all");
  const [conversationPrefs, setConversationPrefs] = useState<Record<string, { pinned?: boolean; archived?: boolean }>>({});
  const lastCueRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    try {
      setConversationPrefs(JSON.parse(localStorage.getItem(`inbox-prefs:${user.id}`) || "{}"));
    } catch {
      setConversationPrefs({});
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchConversations();
  }, [user, conversationPrefs]);

  useEffect(() => {
    const tab = searchParams.get("tab") as InboxTab | null;
    if (tab && ["all", "pinned", "activity", "requests", "archived"].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` }, () => fetchConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        fetchNotifications();
        const incoming = payload.new as any;
        const type = (incoming?.type || "all") as NotificationType;
        const now = Date.now();
        if (profile?.sound_notifications && allowsNotificationType(profile, type) && !isQuietHoursNow(profile) && now - lastCueRef.current > 2500) {
          lastCueRef.current = now;
          playNotificationCue(getNotificationSound(profile));
          if (navigator.vibrate) navigator.vibrate(18);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, conversationPrefs, profile]);

  const fetchConversations = async () => {
    if (!user) return;
    setLoading(true);

    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = participations.map((p: any) => p.conversation_id);
    const convos: Conversation[] = [];

    for (const convId of convIds) {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id, profiles:user_id(username, display_name, avatar_url)")
        .eq("conversation_id", convId)
        .neq("user_id", user.id);

      const otherUser = parts?.[0];

      const { data: msgs } = await supabase
        .from("messages")
        .select("content, created_at, is_read")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = msgs?.[0];
      const lastContent = lastMsg?.content || "";
      const readableLastMessage = isEncryptedContent(lastContent)
        ? await decryptMessageContent(lastContent, convId)
        : lastContent;

      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", convId)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      convos.push({
        id: convId,
        name: (otherUser as any)?.profiles?.display_name || (otherUser as any)?.profiles?.username || "Utilisateur",
        avatar: (otherUser as any)?.profiles?.display_name?.[0] || (otherUser as any)?.profiles?.username?.[0] || "?",
        lastMessage: readableLastMessage || "Aucun message",
        time: lastMsg ? getTimeAgo(lastMsg.created_at) : "",
        unread: count || 0,
        online: false,
        pinned: conversationPrefs[convId]?.pinned === true,
        archived: conversationPrefs[convId]?.archived === true,
        request: false,
        admin: false,
      });
    }

    setConversations(convos.sort((a, b) => Number(b.pinned) - Number(a.pinned)));
    setLoading(false);
  };

  const fetchNotifications = async () => {
    if (!user) return;
    setNotificationsLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*, from_profile:from_user_id(username)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);
    setNotifications((data || []).map((n: any) => ({
      id: n.id,
      type: n.type,
      content: n.content,
      from_username: n.from_profile?.username || "bardeur",
      is_read: n.is_read,
      created_at: n.created_at,
      reference_id: n.reference_id,
    })));
    setNotificationsLoading(false);
  };

  const markAllNotificationsRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const openNotification = async (item: InboxNotification) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", item.id);
    setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
    if (item.type === "message" && item.reference_id) navigate(`/chat/${item.reference_id}`);
    else if (item.reference_id && (item.type === "video" || item.type === "share" || item.type === "comment" || item.type === "like")) navigate(`/?video=${item.reference_id}`);
    else navigate(`/profile/${item.from_username}`);
  };

  const updateConversationPref = (id: string, key: "pinned" | "archived") => {
    if (!user) return;
    const next = {
      ...conversationPrefs,
      [id]: { ...conversationPrefs[id], [key]: !conversationPrefs[id]?.[key] },
    };
    setConversationPrefs(next);
    localStorage.setItem(`inbox-prefs:${user.id}`, JSON.stringify(next));
  };

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "maintenant";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}j`;
  };

  const filteredConversations = useMemo(() => conversations
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(c => {
      if (activeTab === "pinned") return c.pinned && !c.archived;
      if (activeTab === "archived") return c.archived;
      if (activeTab === "requests") return c.request;
      return !c.archived;
    }), [activeTab, conversations, searchQuery]);

  const filteredNotifications = useMemo(() => {
    const base = notificationFilter === "all" ? notifications : notifications.filter(n => n.type === notificationFilter);
    return base.filter(n => `${n.content} ${n.from_username}`.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [notificationFilter, notifications, searchQuery]);

  const tabs = [
    { id: "all" as const, label: "Tous", count: conversations.filter(c => !c.archived).length, icon: Bell },
    { id: "pinned" as const, label: "Epingles", count: conversations.filter(c => c.pinned && !c.archived).length, icon: Pin },
    { id: "activity" as const, label: "Actu", count: notifications.filter(n => !n.is_read).length, icon: Heart },
    { id: "requests" as const, label: "Demandes", count: conversations.filter(c => c.request).length, icon: UserPlus },
    { id: "archived" as const, label: "Archives", count: conversations.filter(c => c.archived).length, icon: Archive },
  ];

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-lg px-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Messages</h1>
          <div className="rounded-full bg-card px-2 py-1 text-[11px] font-bold text-muted-foreground">
            {conversations.reduce((sum, c) => sum + c.unread, 0) > 99 ? "99+" : conversations.reduce((sum, c) => sum + c.unread, 0)} non lus
          </div>
        </div>

        <div className="glass mb-4 flex items-center gap-3 rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher une conversation..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="mb-4 grid grid-cols-5 gap-2">
          {tabs.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`rounded-2xl px-2 py-2 text-[11px] font-bold ${activeTab === tab.id ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
              <tab.icon className="mx-auto mb-1 h-4 w-4" />
              <span>{tab.label}</span>
              <span className="ml-1 tabular-nums">{tab.count > 99 ? "99+" : tab.count}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="glass rounded-xl px-2 py-2 text-center text-[11px] text-muted-foreground"><Bell className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />Temps reel</div>
          <div className="glass rounded-xl px-2 py-2 text-center text-[11px] text-muted-foreground"><ShieldCheck className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />Admin</div>
          <div className="glass rounded-xl px-2 py-2 text-center text-[11px] text-muted-foreground"><CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />Lu/non lu</div>
        </div>

        {activeTab === "activity" ? (
          <div>
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {[
                ["all", "Tout"],
                ["message", "Messages"],
                ["like", "Likes"],
                ["comment", "Coms"],
                ["follow", "Fans"],
                ["share", "Partages"],
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setNotificationFilter(key as NotificationType)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${notificationFilter === key ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                  {label}
                </button>
              ))}
              {notifications.some(n => !n.is_read) && (
                <button type="button" onClick={markAllNotificationsRead} className="shrink-0 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-primary">Tout lu</button>
              )}
            </div>
            {notificationsLoading ? (
              <div className="text-center py-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">Aucune notification ici</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNotifications.map((n, i) => {
                  const Icon = notificationIcons[n.type] || Bell;
                  return (
                    <motion.button key={n.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} onClick={() => openNotification(n)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${n.is_read ? "hover:bg-card" : "bg-primary/8"}`}>
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-card">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground"><span className="font-bold">@{n.from_username}</span> <span className="text-muted-foreground">{n.content}</span></p>
                        <p className="text-[11px] text-muted-foreground">{getTimeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <p className="mb-2 text-sm text-muted-foreground">Aucune conversation ici</p>
            <p className="text-xs text-muted-foreground">Les messages, demandes et archives restent separes pour garder l'inbox propre.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredConversations.map(conv => (
              <motion.div
                key={conv.id}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-card"
              >
                <button type="button" onClick={() => navigate(`/chat/${conv.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                    {conv.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm font-semibold ${conv.unread ? "text-foreground" : "text-foreground/80"}`}>{conv.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{conv.time}</span>
                    </div>
                    <p className={`truncate text-xs ${conv.unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>{conv.lastMessage}</p>
                  </div>
                </button>
                <button type="button" onClick={() => updateConversationPref(conv.id, "pinned")} className={`grid h-9 w-9 place-items-center rounded-full ${conv.pinned ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`} aria-label={conv.pinned ? "Desepingler" : "Epingler"}>
                  <Pin className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => updateConversationPref(conv.id, "archived")} className={`grid h-9 w-9 place-items-center rounded-full ${conv.archived ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`} aria-label={conv.archived ? "Desarchiver" : "Archiver"}>
                  <Archive className="h-4 w-4" />
                </button>
                {conv.unread > 0 && (
                  <div className="flex h-5 min-w-5 items-center justify-center rounded-full gradient-primary">
                    <span className="px-1 text-[10px] font-bold text-primary-foreground tabular-nums">{conv.unread > 99 ? "99+" : conv.unread}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
