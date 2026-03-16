import { Home, Search, Plus, MessageCircle, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const navItems = [
  { path: "/", icon: Home, label: "Accueil" },
  { path: "/explore", icon: Search, label: "Explorer" },
  { path: "/create", icon: Plus, label: "", isCreate: true },
  { path: "/inbox", icon: MessageCircle, label: "Boîte" },
  { path: "/profile", icon: User, label: "Profil" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 md:hidden">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          if (item.isCreate) {
            return (
              <motion.button
                key={item.path}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate(item.path)}
                className="relative flex h-10 w-12 items-center justify-center rounded-lg gradient-primary pulse-glow"
              >
                <Plus className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
              </motion.button>
            );
          }
          return (
            <motion.button
              key={item.path}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-0.5"
            >
              <item.icon
                className={`h-6 w-6 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
