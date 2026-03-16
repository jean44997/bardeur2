import { Home, Search, Plus, MessageCircle, User, Compass, Heart, Settings, TrendingUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const mainItems = [
  { path: "/", icon: Home, label: "Accueil" },
  { path: "/explore", icon: Compass, label: "Explorer" },
  { path: "/trending", icon: TrendingUp, label: "Tendances" },
  { path: "/inbox", icon: MessageCircle, label: "Messages" },
  { path: "/notifications", icon: Heart, label: "Notifications" },
  { path: "/profile", icon: User, label: "Profil" },
];

export default function DesktopSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 w-[280px] flex-col border-r border-border bg-sidebar p-4">
      {/* Logo */}
      <div className="mb-8 px-3 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          <span className="gradient-primary bg-clip-text text-transparent">Vanish</span>
        </h1>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 flex-1">
        {mainItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <motion.button
              key={item.path}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </motion.button>
          );
        })}

        {/* Create Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("/create")}
          className="mt-4 flex items-center justify-center gap-2 rounded-lg gradient-primary py-3 text-sm font-bold text-primary-foreground pulse-glow"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          Créer
        </motion.button>
      </nav>

      {/* Bottom */}
      <div className="border-t border-border pt-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate("/settings")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        >
          <Settings className="h-5 w-5" />
          Paramètres
        </motion.button>
      </div>
    </aside>
  );
}
