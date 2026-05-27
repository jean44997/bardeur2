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

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/profile") return location.pathname.startsWith("/profile");
    if (path === "/inbox") return location.pathname.startsWith("/inbox") || location.pathname.startsWith("/chat");
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <nav className="pwa-bottom-nav fixed z-50 rounded-t-[1.35rem] border border-b-0 border-border/40 bg-background/62 shadow-2xl shadow-black/30 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/50 md:hidden" aria-label="Navigation principale">
      <div className="grid grid-cols-[1fr_1fr_4.15rem_1fr_1fr] items-center gap-1 px-2 pt-2">
        {navItems.map(item => {
          const active = isActive(item.path);
          if (item.isCreate) {
            return (
              <motion.button key={item.path} type="button" whileTap={{ scale: 0.9 }} onClick={() => handleNav(item.path, item.requiresAuth)} className="relative mx-auto flex h-12 w-16 items-center justify-center rounded-2xl gradient-primary pulse-glow" aria-label="Creer">
                <Plus className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
              </motion.button>
            );
          }
          return (
            <motion.button key={item.path} type="button" whileTap={{ scale: 0.9 }} onClick={() => handleNav(item.path, item.requiresAuth)} aria-label={item.label} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 ${active ? "bg-foreground/10" : ""}`}>
              <span className="relative">
                <item.icon className={`h-6 w-6 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={active ? 2.5 : 2} />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className={`max-w-[3.4rem] truncate text-[10px] font-medium leading-3 max-[340px]:text-[9px] ${active ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
