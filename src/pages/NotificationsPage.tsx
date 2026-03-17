import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, UserPlus, Video, Share2, AtSign } from "lucide-react";
import { useNavigate } from "react-router-dom";

const notifications = [
  { id: "1", type: "follow", icon: UserPlus, color: "text-primary", user: "blazerunner", text: "a commencé à te suivre", time: "2min", read: false },
  { id: "2", type: "like", icon: Heart, color: "text-primary", user: "escapist.co", text: "a aimé ta vidéo", time: "15min", read: false },
  { id: "3", type: "comment", icon: MessageCircle, color: "text-accent", user: "funfactory", text: "a commenté : \"Trop stylé 🔥🔥\"", time: "1h", read: false },
  { id: "4", type: "mention", icon: AtSign, color: "text-accent", user: "joyride.tv", text: "t'a mentionné dans un commentaire", time: "2h", read: true },
  { id: "5", type: "video", icon: Video, color: "text-primary", user: "meltdown.xo", text: "a publié une nouvelle vidéo", time: "3h", read: true },
  { id: "6", type: "share", icon: Share2, color: "text-accent", user: "blazerunner", text: "a partagé ta vidéo", time: "5h", read: true },
  { id: "7", type: "like", icon: Heart, color: "text-primary", user: "newuser42", text: "et 12 autres ont aimé ta vidéo", time: "8h", read: true },
  { id: "8", type: "follow", icon: UserPlus, color: "text-primary", user: "creator_pro", text: "a commencé à te suivre", time: "1j", read: true },
];

export default function NotificationsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="md:hidden">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <h1 className="text-xl font-bold text-foreground">Notifications</h1>
          <span className="ml-auto text-xs text-primary font-semibold cursor-pointer">Tout marquer comme lu</span>
        </div>

        <div className="space-y-1">
          {notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors cursor-pointer ${
                !n.read ? "bg-primary/5" : "hover:bg-card"
              }`}
            >
              <div className={`h-10 w-10 rounded-full bg-card flex items-center justify-center`}>
                <n.icon className={`h-5 w-5 ${n.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">@{n.user}</span>{" "}
                  <span className="text-muted-foreground">{n.text}</span>
                </p>
                <span className="text-[11px] text-muted-foreground">{n.time}</span>
              </div>
              {!n.read && <div className="h-2 w-2 rounded-full gradient-primary flex-shrink-0" />}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}