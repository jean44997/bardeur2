import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Users, Flag, BarChart3, Ban, Search, Download, RefreshCw, ExternalLink, Clock, CheckCircle, MessageCircle, Send, Stethoscope, Paperclip, X as XIcon, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BanUserDialog from "@/components/admin/BanUserDialog";


export default function AdminPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "reports" | "messages">("stats");
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [banned, setBanned] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, videos: 0, reports: 0, banned: 0 });
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [reportStatus, setReportStatus] = useState<"all" | "pending" | "resolved" | "dismissed">("pending");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminTargetId, setAdminTargetId] = useState("");
  const [sendingAdminMessage, setSendingAdminMessage] = useState(false);
  const [banTarget, setBanTarget] = useState<any | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);


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
      (supabase as any).from("banned_users").select("user_id, reason, expires_at, is_permanent, created_at"),
    ]);

    const bannedList = (bannedRes.data || []).filter((b: any) =>
      b.is_permanent || !b.expires_at || new Date(b.expires_at) > new Date()
    );
    setUsers(usersRes.data || []);
    setReports(reportsRes.data || []);
    setBanned(bannedList);
    setStats({
      users: usersRes.data?.length || 0,
      videos: videosRes.count || 0,
      reports: reportsRes.data?.length || 0,
      banned: bannedList.length,
    });
    setLoading(false);
  };

  const isBanned = (uid: string) => banned.some(b => b.user_id === uid);

  const unbanUser = async (userId: string, username: string) => {
    const { error } = await (supabase as any).from("banned_users").delete().eq("user_id", userId);
    if (error) { toast.error("Débannissement impossible"); return; }
    toast.success(`@${username} débanni`);
    fetchAll();
  };

  const handleReport = async (reportId: string, action: "resolved" | "dismissed") => {
    await supabase.from("reports").update({ status: action }).eq("id", reportId);
    toast.success(action === "resolved" ? "Signalement traité" : "Signalement ignoré");
    fetchAll();
  };

  const uploadMediaForMessage = async (): Promise<{ url: string; type: string } | null> => {
    if (!mediaFile || !user) return null;
    setUploadingMedia(true);
    try {
      const ext = mediaFile.name.split(".").pop() || "bin";
      const path = `${user.id}/admin-broadcast/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, mediaFile, { contentType: mediaFile.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      return { url: data.publicUrl, type: mediaFile.type };
    } catch (err: any) {
      toast.error(err?.message || "Upload échoué");
      return null;
    } finally {
      setUploadingMedia(false);
    }
  };


  const sendAdminMessage = async (broadcast = false) => {
    if (!user) return;
    const content = adminMessage.trim().slice(0, 600);
    if (!content) {
      toast.error("Message vide");
      return;
    }

    const targets = broadcast
      ? users.filter(u => u.id !== user.id).slice(0, 300)
      : users.filter(u => u.id === adminTargetId && u.id !== user.id);

    if (targets.length === 0) {
      toast.error(broadcast ? "Aucun utilisateur a contacter" : "Choisis un utilisateur");
      return;
    }
    if (broadcast && !window.confirm(`Envoyer ce message a ${targets.length} utilisateurs ?`)) return;

    setSendingAdminMessage(true);
    let sent = 0;
    let failed = 0;
    let lastError = "";
    for (const target of targets) {
      try {
        const { error } = await (supabase as any).rpc("send_admin_official_message", {
          _recipient_id: target.id,
          _content: `[BARDEUR · Équipe officielle]\n${content}`,
        });
        if (error) throw error;
        sent += 1;
      } catch (error: any) {
        failed += 1;
        lastError = error?.message || "Erreur inconnue";
      }
    }
    setSendingAdminMessage(false);
    if (sent > 0) {
      toast.success(failed ? `${sent} envoyes, ${failed} echecs` : `${sent} message${sent > 1 ? "s" : ""} envoye${sent > 1 ? "s" : ""}`);
      setAdminMessage("");
      if (!broadcast) setAdminTargetId("");
      fetchAll();
    } else {
      toast.error(lastError ? `Aucun message envoye: ${lastError}` : "Aucun message envoye");
    }
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
      <div className="min-h-[100svh] bg-background flex items-center justify-center mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
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
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-2xl px-4">
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="tap-target-lg glass-action grid place-items-center rounded-full" aria-label="Retour">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Administration</h1>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => navigate("/admin/diagnostic")} className="glass rounded-full p-2" aria-label="Diagnostic">
              <Stethoscope className="h-4 w-4 text-foreground" />
            </button>
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
            { key: "messages", label: "Messages", icon: MessageCircle },
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

            {activeTab === "messages" && (
              <div className="space-y-3">
                <div className="glass rounded-2xl p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-foreground">Message admin prive</p>
                      <p className="text-xs text-muted-foreground">Envoie dans une vraie conversation, visible dans Messages.</p>
                    </div>
                  </div>
                  <select
                    value={adminTargetId}
                    onChange={e => setAdminTargetId(e.target.value)}
                    className="mb-3 w-full rounded-xl bg-card px-3 py-3 text-sm text-foreground outline-none"
                  >
                    <option value="">Choisir un utilisateur</option>
                    {filteredUsers.filter(u => u.id !== user?.id).slice(0, 120).map(u => (
                      <option key={u.id} value={u.id}>@{u.username || "user"} - {u.display_name || "Utilisateur"}</option>
                    ))}
                  </select>
                  <textarea
                    value={adminMessage}
                    onChange={e => setAdminMessage(e.target.value)}
                    maxLength={600}
                    rows={5}
                    placeholder="Message de moderation, aide, recompense ou information..."
                    className="mb-3 w-full resize-none rounded-xl bg-card px-3 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => sendAdminMessage(false)}
                      disabled={sendingAdminMessage || !adminTargetId || !adminMessage.trim()}
                      className="flex items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-45"
                    >
                      <Send className="h-4 w-4" /> Envoyer prive
                    </button>
                    <button
                      type="button"
                      onClick={() => sendAdminMessage(true)}
                      disabled={sendingAdminMessage || !adminMessage.trim()}
                      className="flex items-center justify-center gap-2 rounded-xl bg-card px-4 py-3 text-sm font-bold text-foreground disabled:opacity-45"
                    >
                      <Users className="h-4 w-4" /> Tous
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">Broadcast limite a 300 users par envoi, avec anti-spam serveur et conversations reutilisees.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
