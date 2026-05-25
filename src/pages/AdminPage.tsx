import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Users, Flag, BarChart3, Ban, Search, Download, RefreshCw, ExternalLink, Clock, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "reports">("stats");
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, videos: 0, reports: 0, banned: 0 });
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [reportStatus, setReportStatus] = useState<"all" | "pending" | "resolved" | "dismissed">("pending");

  useEffect(() => {
    if (role === "super_admin" || role === "admin") {
      fetchAll();
    }
  }, [role]);

  const fetchAll = async () => {
    setLoading(true);
    const [usersRes, videosRes, reportsRes, bannedRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("videos").select("*", { count: "exact", head: true }),
      supabase.from("reports").select("*, reporter:reporter_id(username), reported:reported_user_id(username)").order("created_at", { ascending: false }),
      supabase.from("banned_users").select("*", { count: "exact", head: true }),
    ]);

    setUsers(usersRes.data || []);
    setReports(reportsRes.data || []);
    setStats({
      users: usersRes.data?.length || 0,
      videos: videosRes.count || 0,
      reports: reportsRes.data?.length || 0,
      banned: bannedRes.count || 0,
    });
    setLoading(false);
  };

  const banUser = async (userId: string, username: string) => {
    if (!user) return;
    const { error } = await supabase.from("banned_users").insert({ user_id: userId, banned_by: user.id, reason: "Banni par admin" });
    if (error) { toast.error("Erreur lors du bannissement"); return; }
    toast.success(`@${username} a été banni`);
    fetchAll();
  };

  const handleReport = async (reportId: string, action: "resolved" | "dismissed") => {
    await supabase.from("reports").update({ status: action }).eq("id", reportId);
    toast.success(action === "resolved" ? "Signalement traité" : "Signalement ignoré");
    fetchAll();
  };

  const exportAdminJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      stats,
      reports: reports.slice(0, 200),
      users: users.map(({ id, username, display_name, role, created_at }) => ({ id, username, display_name, role, created_at })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bardeur-admin-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (role !== "super_admin" && role !== "admin") {
    return (
      <div className="min-h-[100svh] bg-background flex items-center justify-center pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-2">Accès refusé</h2>
          <p className="text-sm text-muted-foreground">Seuls les administrateurs peuvent accéder à cette page</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Utilisateurs", value: stats.users.toLocaleString(), icon: Users, color: "text-primary" },
    { label: "Vidéos", value: stats.videos.toLocaleString(), icon: BarChart3, color: "text-accent" },
    { label: "Signalements", value: stats.reports.toLocaleString(), icon: Flag, color: "text-destructive" },
    { label: "Bannis", value: stats.banned.toLocaleString(), icon: Ban, color: "text-muted-foreground" },
    { label: "En attente", value: reports.filter(r => r.status === "pending").length.toLocaleString(), icon: Clock, color: "text-accent" },
    { label: "Traités", value: reports.filter(r => r.status === "resolved").length.toLocaleString(), icon: CheckCircle, color: "text-primary" },
  ];
  const filteredUsers = users.filter(u => `${u.username || ""} ${u.display_name || ""}`.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredReports = reports.filter(r => reportStatus === "all" ? true : r.status === reportStatus);

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Administration</h1>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={fetchAll} className="glass rounded-full p-2" aria-label="Actualiser">
              <RefreshCw className="h-4 w-4 text-foreground" />
            </button>
            <button type="button" onClick={exportAdminJson} className="glass rounded-full p-2" aria-label="Exporter">
              <Download className="h-4 w-4 text-foreground" />
            </button>
            <span className="text-xs font-medium text-primary">{role === "super_admin" ? "Super Admin" : "Admin"}</span>
          </div>
        </div>

        <div className="flex gap-1 glass rounded-xl p-1 mb-6">
          {[
            { key: "stats", label: "Stats", icon: BarChart3 },
            { key: "users", label: "Utilisateurs", icon: Users },
            { key: "reports", label: "Signalements", icon: Flag },
          ].map(tab => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${activeTab === tab.key ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </motion.button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : (
          <>
            {activeTab === "stats" && (
              <div className="grid grid-cols-2 gap-3">
                {statCards.map(s => (
                  <div key={s.label} className="glass rounded-2xl p-4">
                    <s.icon className={`h-6 w-6 ${s.color} mb-2`} />
                    <p className="text-2xl font-bold text-foreground tabular-nums">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-2">
                <div className="glass mb-3 flex items-center gap-2 rounded-xl px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Rechercher un utilisateur..." className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                  <span className="text-[11px] font-bold text-muted-foreground">{filteredUsers.length}</span>
                </div>
                {filteredUsers.map(u => (
                  <div key={u.id} className="glass rounded-xl p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-card flex items-center justify-center text-sm font-bold text-foreground overflow-hidden">
                      {u.avatar_url ? <img src={u.avatar_url} className="h-full w-full object-cover" /> : u.display_name?.[0] || "?"}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-foreground">@{u.username}</span>
                      <p className="text-xs text-muted-foreground">{u.display_name}</p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => navigate(`/profile/${u.username}`)}
                      className="h-8 w-8 rounded-lg bg-card flex items-center justify-center"
                      aria-label="Voir profil"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </motion.button>
                    {u.id !== user?.id && (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => banUser(u.id, u.username)}
                        className="h-8 w-8 rounded-lg bg-destructive/20 flex items-center justify-center"
                      >
                        <Ban className="h-4 w-4 text-destructive" />
                      </motion.button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "reports" && (
              <div className="space-y-2">
                <div className="glass mb-3 grid grid-cols-4 gap-1 rounded-xl p-1">
                  {(["pending", "all", "resolved", "dismissed"] as const).map(status => (
                    <button key={status} type="button" onClick={() => setReportStatus(status)} className={`rounded-lg py-2 text-[11px] font-bold ${reportStatus === status ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
                      {status === "pending" ? "Attente" : status === "all" ? "Tous" : status === "resolved" ? "Traités" : "Ignorés"}
                    </button>
                  ))}
                </div>
                {filteredReports.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Aucun signalement</p>
                ) : (
                  filteredReports.map(r => (
                    <div key={r.id} className="glass rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase">{r.type}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === "pending" ? "bg-destructive/20 text-destructive" : "bg-accent/20 text-accent"}`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">{r.reason}</p>
                      <p className="text-xs text-muted-foreground">Par @{r.reporter?.username} · Contre @{r.reported?.username}</p>
                      {r.status === "pending" && (
                        <div className="flex gap-2 mt-3">
                          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleReport(r.id, "resolved")} className="flex-1 rounded-lg gradient-primary py-2 text-xs font-semibold text-primary-foreground">Traiter</motion.button>
                          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleReport(r.id, "dismissed")} className="flex-1 rounded-lg glass py-2 text-xs font-semibold text-foreground">Ignorer</motion.button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
