import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Users, Flag, BarChart3, MessageSquareWarning, Ban, Trash2, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const mockUsers = [
  { id: "1", username: "blazerunner", displayName: "Blaze Runner", status: "active", videos: 42, reports: 0 },
  { id: "2", username: "escapist.co", displayName: "Escapist", status: "active", videos: 18, reports: 2 },
  { id: "3", username: "funfactory", displayName: "Fun Factory", status: "banned", videos: 67, reports: 5 },
  { id: "4", username: "joyride.tv", displayName: "JoyRide", status: "active", videos: 8, reports: 1 },
];

const mockReports = [
  { id: "1", type: "video", reason: "Contenu inapproprié", reporter: "user123", target: "blazerunner", date: "Il y a 2h" },
  { id: "2", type: "comment", reason: "Harcèlement", reporter: "user456", target: "escapist.co", date: "Il y a 5h" },
  { id: "3", type: "user", reason: "Spam", reporter: "user789", target: "spammer99", date: "Il y a 1j" },
];

const stats = [
  { label: "Utilisateurs", value: "12,458", icon: Users, color: "text-primary" },
  { label: "Vidéos", value: "89,230", icon: BarChart3, color: "text-accent" },
  { label: "Signalements", value: "23", icon: Flag, color: "text-destructive" },
  { label: "Bannis", value: "15", icon: Ban, color: "text-muted-foreground" },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "reports">("stats");

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Administration</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 glass rounded-xl p-1 mb-6">
          {[
            { key: "stats", label: "Stats", icon: BarChart3 },
            { key: "users", label: "Utilisateurs", icon: Users },
            { key: "reports", label: "Signalements", icon: Flag },
          ].map((tab) => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key ? "gradient-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Stats Tab */}
        {activeTab === "stats" && (
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="glass rounded-2xl p-4">
                <s.icon className={`h-6 w-6 ${s.color} mb-2`} />
                <p className="text-2xl font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-2">
            {mockUsers.map((user) => (
              <div key={user.id} className="glass rounded-xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-card flex items-center justify-center text-sm font-bold text-foreground">
                  {user.displayName[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">@{user.username}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      user.status === "banned" ? "bg-destructive/20 text-destructive" : "bg-accent/20 text-accent"
                    }`}>
                      {user.status === "banned" ? "Banni" : "Actif"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{user.videos} vidéos · {user.reports} signalements</p>
                </div>
                <div className="flex gap-1">
                  <motion.button whileTap={{ scale: 0.9 }} className="h-8 w-8 rounded-lg bg-card flex items-center justify-center">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toast.success(`@${user.username} a été banni`)}
                    className="h-8 w-8 rounded-lg bg-destructive/20 flex items-center justify-center"
                  >
                    <Ban className="h-4 w-4 text-destructive" />
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <div className="space-y-2">
            {mockReports.map((r) => (
              <div key={r.id} className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquareWarning className="h-4 w-4 text-destructive" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">{r.type}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{r.date}</span>
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{r.reason}</p>
                <p className="text-xs text-muted-foreground">Signalé par {r.reporter} · Contre @{r.target}</p>
                <div className="flex gap-2 mt-3">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toast.success("Signalement traité")}
                    className="flex-1 rounded-lg gradient-primary py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Traiter
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toast.info("Signalement ignoré")}
                    className="flex-1 rounded-lg glass py-2 text-xs font-semibold text-foreground"
                  >
                    Ignorer
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}