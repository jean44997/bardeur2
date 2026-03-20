import { Home, Search, Plus, MessageCircle, User, Compass, Settings, Shield, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.png";

const mainItems = [
  { path: "/", icon: Home, label: "Accueil", requiresAuth: false },
  { path: "/explore", icon: Compass, label: "Explorer", requiresAuth: true },
  { path: "/notifications", icon: Bell, label: "Notifications", requiresAuth: true },
  { path: "/inbox", icon: MessageCircle, label: "Messages", requiresAuth: true },
  { path: "/profile", icon: User, label: "Profil", requiresAuth: true },
];

export default function DesktopSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { user, role } = useAuth();

  const bottomItems = [
    { path: "/settings", icon: Settings, label: "Paramètres", show: !!user },
    { path: "/admin", icon: Shield, label: "Admin", show: role === "super_admin" || role === "admin" },
  ].filter(i => i.show);

  return (
    <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 z-50 flex-col border-r border-border bg-sidebar transition-all duration-300 ${collapsed ? "w-[72px]" : "w-[260px]"}`} style={{ "--sidebar-width": collapsed ? "72px" : "260px" } as any}>
      <div className="flex items-center justify-between px-3 pt-4 pb-2 mb-2">
        <div className="flex items-center gap-2 overflow-hidden cursor-pointer" onClick={() => navigate("/")}>
          <img src={logo} alt="BARDEUR YK" className="h-9 w-9 rounded-lg object-contain flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="text-lg font-extrabold tracking-tight whitespace-nowrap overflow-hidden">
                <span className="gradient-primary bg-clip-text text-transparent">BARDEUR</span>
                <span className="text-foreground ml-1">YK</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCollapsed(p => !p)} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-sidebar-accent transition-colors flex-shrink-0">
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
        </motion.button>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 px-2">
        {mainItems.map(item => {
          if (item.requiresAuth && !user) return null;
          const active = location.pathname === item.path;
          return (
            <motion.button
              key={item.path}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"} ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" strokeWidth={active ? 2.5 : 2} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="whitespace-nowrap overflow-hidden">{item.label}</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}

        {user && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/create")}
            className={`mt-3 flex items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground pulse-glow ${collapsed ? "px-0" : ""}`}
          >
            <Plus className="h-5 w-5 flex-shrink-0" strokeWidth={2.5} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="whitespace-nowrap overflow-hidden">Créer</motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}

        {!user && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/auth")}
            className={`mt-3 flex items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground pulse-glow ${collapsed ? "px-0" : ""}`}
          >
            <User className="h-5 w-5 flex-shrink-0" strokeWidth={2.5} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="whitespace-nowrap overflow-hidden">Se connecter</motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </nav>

      {bottomItems.length > 0 && (
        <div className="border-t border-border px-2 py-2">
          {bottomItems.map(item => (
            <motion.button
              key={item.path}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} className="whitespace-nowrap overflow-hidden">{item.label}</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </div>
      )}
    </aside>
  );
}
