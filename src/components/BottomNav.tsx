import { Home, Search, Plus, Radio, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const navItems = [
    { path: "/", icon: Home, label: "Accueil", requiresAuth: false },
    { path: "/explore", icon: Search, label: "Explorer", requiresAuth: false },
    { path: "/create", icon: Plus, label: "", isCreate: true, requiresAuth: true },
    { path: "/lives", icon: Radio, label: "Lives", requiresAuth: false },
    { path: "/profile", icon: User, label: "Profil", requiresAuth: true },
  ];

  const handleNav = (path: string, requiresAuth?: boolean) => {
    if (requiresAuth && !user) {
      navigate("/auth");
      return;
    }
    navigate(path);
  };

  return (
    <nav className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-3 right-3 z-50 rounded-3xl border border-border/40 bg-background/62 shadow-2xl shadow-black/30 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/50 md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
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
              <item.icon className={`h-6 w-6 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
