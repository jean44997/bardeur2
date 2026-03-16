import { Search, Circle } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const conversations = [
  { id: "1", name: "Blaze Runner", msg: "T'as vu la dernière vidéo ? 🔥", time: "2min", unread: 3, online: true, verified: true },
  { id: "2", name: "Escapist", msg: "On fait une collab ?", time: "15min", unread: 0, online: true, verified: false },
  { id: "3", name: "Fun Factory", msg: "Envoyé une vidéo", time: "1h", unread: 1, online: false, verified: true },
  { id: "4", name: "JoyRide", msg: "Merci pour le follow ! 🙌", time: "3h", unread: 0, online: false, verified: false },
  { id: "5", name: "Meltdown XO", msg: "😂😂😂", time: "1j", unread: 0, online: true, verified: true },
];

export default function InboxPage() {
  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[280px]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <h1 className="text-xl font-bold text-foreground mb-4">Messages</h1>

        {/* Search */}
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher une conversation..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {/* Conversations */}
        <div className="flex flex-col gap-1">
          {conversations.map((conv) => (
            <motion.button
              key={conv.id}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-card transition-colors w-full text-left"
            >
              {/* Avatar */}
              <div className="relative">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground">
                  {conv.name[0]}
                </div>
                {conv.online && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-background" style={{ background: "hsl(142, 70%, 45%)" }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${conv.unread ? "text-foreground" : "text-foreground/80"}`}>
                    {conv.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{conv.time}</span>
                </div>
                <p className={`text-xs truncate ${conv.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {conv.msg}
                </p>
              </div>

              {/* Unread Badge */}
              {conv.unread > 0 && (
                <div className="h-5 min-w-5 rounded-full gradient-primary flex items-center justify-center">
                  <span className="text-[10px] font-bold text-primary-foreground tabular-nums px-1">{conv.unread}</span>
                </div>
              )}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
