import { useEffect, useState } from "react";
import { Home, Search, Plus, MessageCircle, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const navItems = [
    { path: "/", icon: Home, label: "Accueil", requiresAuth: false },
    { path: "/explore", icon: Search, label: "Explorer", requiresAuth: false },
    { path: "/create", icon: Plus, label: "", isCreate: true, requiresAuth: true },
    { path: "/inbox", icon: MessageCircle, label: "Messages", requiresAuth: true, badge: unread },
    { path: "/profile", icon: User, label: "Profil", requiresAuth: true },
  ];

  const refreshUnread = async () => {
    if (!user) { setUnread(0); return; }
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const convIds = (participations || []).map((p: any) => p.conversation_id);
    const [messageCount, activityCount] = await Promise.all([
      convIds.length
        ? supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .neq("sender_id", user.id)
          .eq("is_read", false)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
    ]);
    setUnread((messageCount.count || 0) + (activityCount.count || 0));
  };

  useEffect(() => {
    refreshUnread();
    if (!user) return;
    const channel = supabase
      .channel(`bottom-nav-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refreshUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` }, refreshUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleNav = (path: string, requiresAuth?: boolean) => {
    if (requiresAuth && !user) {
      navigate("/auth");
      return;
    }
    navigate(path);
  };

  return (
    <nav className="pwa-bottom-nav fixed left-2 right-2 z-50 rounded-[1.35rem] border border-border/40 bg-background/62 shadow-2xl shadow-black/30 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/50 md:hidden">
      <div className="flex items-center justify-around px-2 pb-[max(0.35rem,calc(env(safe-area-inset-bottom)*0.45))] pt-2">
        {navItems.map(item => {
          const active = location.pathname === item.path;
          if (item.isCreate) {
            return (
              <motion.button key={item.path} whileTap={{ scale: 0.9 }} onClick={() => handleNav(item.path, item.requiresAuth)} className="relative flex h-11 w-14 items-center justify-center rounded-2xl gradient-primary pulse-glow" aria-label="Créer">
                <Plus className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
              </motion.button>
            );
          }
          return (
            <motion.button key={item.path} whileTap={{ scale: 0.9 }} onClick={() => handleNav(item.path, item.requiresAuth)} className={`flex min-w-12 flex-col items-center gap-0.5 rounded-2xl px-2 py-1 ${active ? "bg-foreground/10" : ""}`}>
              <span className="relative">
                <item.icon className={`h-6 w-6 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={active ? 2.5 : 2} />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
