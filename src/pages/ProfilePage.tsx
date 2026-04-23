import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Grid3X3, Heart, Bookmark, BadgeCheck, Share2, QrCode, Link2, Camera, Trash2, MessageCircle, Edit3, ToggleLeft, ToggleRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
import QRCode from "qrcode";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { username: paramUsername } = useParams();
  const { user, profile, updateProfile, role } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [videos, setVideos] = useState<any[]>([]);
  const [likedVideos, setLikedVideos] = useState<any[]>([]);
  const [savedVideos, setSavedVideos] = useState<any[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, likes: 0, videos: 0, views: 0 });
  const [viewedProfile, setViewedProfile] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [editingVideo, setEditingVideo] = useState<any>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [editCommentsEnabled, setEditCommentsEnabled] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetUserId = isOwnProfile ? user?.id : viewedProfile?.id;
  const currentProfile = isOwnProfile ? profile : viewedProfile;

  useEffect(() => {
    if (paramUsername) {
      fetchUserByUsername(paramUsername);
    } else if (profile) {
      setViewedProfile(null);
      setIsOwnProfile(true);
      setEditBio(profile.bio || "");
      setEditDisplayName(profile.display_name || "");
      setEditWebsite(profile.website || "");
    }
  }, [paramUsername, profile]);

  useEffect(() => {
    if (targetUserId) {
      fetchStats(targetUserId);
      fetchVideos(targetUserId);
      if (isOwnProfile && user) {
        fetchLikedVideos();
        fetchSavedVideos();
      }
    }
  }, [targetUserId, activeTab]);

  const fetchUserByUsername = async (username: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("username", username).single();
    if (data) {
      setViewedProfile(data);
      setIsOwnProfile(user?.id === data.id);
      setEditBio(data.bio || "");
      setEditDisplayName(data.display_name || "");
      setEditWebsite(data.website || "");
      if (user && user.id !== data.id) checkFollowStatus(data.id);
    }
  };

  const checkFollowStatus = async (otherId: string) => {
    if (!user) return;
    const [f1, f2] = await Promise.all([
      supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", otherId).maybeSingle(),
      supabase.from("follows").select("id").eq("follower_id", otherId).eq("following_id", user.id).maybeSingle(),
    ]);
    setIsFollowing(!!f1.data);
    setIsMutual(!!f1.data && !!f2.data);
  };

  const fetchStats = async (userId: string) => {
    const [followers, following, totalLikes, videoData] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("videos").select("likes_count, views_count").eq("user_id", userId),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    setStats({
      followers: followers.count || 0,
      following: following.count || 0,
      likes: totalLikes.data?.reduce((sum: number, v: any) => sum + (v.likes_count || 0), 0) || 0,
      videos: videoData.count || 0,
      views: totalLikes.data?.reduce((sum: number, v: any) => sum + (v.views_count || 0), 0) || 0,
    });
  };

  const fetchVideos = async (userId: string) => {
    const { data } = await supabase.from("videos").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (data) setVideos(data);
  };

  const fetchLikedVideos = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("likes")
      .select("video_id, videos:video_id(id, video_url, thumbnail_url, description, likes_count, views_count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setLikedVideos(data.map((d: any) => d.videos).filter(Boolean));
  };

  const fetchSavedVideos = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("saves")
      .select("video_id, videos:video_id(id, video_url, thumbnail_url, description, likes_count, views_count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setSavedVideos(data.map((d: any) => d.videos).filter(Boolean));
  };

  const handleFollow = async () => {
    if (!user || !viewedProfile) return;
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", viewedProfile.id);
      setIsFollowing(false);
      setIsMutual(false);
      toast.success("Désabonné");
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: viewedProfile.id });
      setIsFollowing(true);
      toast.success("Abonné !");
    }
    fetchStats(viewedProfile.id);
    checkFollowStatus(viewedProfile.id);
  };

  const handleOpenConversation = async () => {
    if (!viewedProfile?.id || !isMutual) return;
    setOpeningChat(true);
    const { data, error } = await supabase.rpc("find_or_create_direct_conversation", { _other_user_id: viewedProfile.id } as any);
    setOpeningChat(false);
    if (error || !data) { toast.error("Conversation indisponible"); return; }
    navigate(`/chat/${data}`);
  };

  const normalizeWebsite = (value: string) => {
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  };

  const handleSaveProfile = async () => {
    const { error } = await updateProfile({
      display_name: editDisplayName.trim(),
      bio: editBio.trim(),
      website: normalizeWebsite(editWebsite.trim()),
    });
    if (error) { toast.error("Erreur lors de la sauvegarde"); return; }
    toast.success("Profil mis à jour ! ✨");
    setIsEditing(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast.error("Choisis une image valide"); return; }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { toast.error("Erreur d'upload"); return; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    await updateProfile({ avatar_url: urlData.publicUrl });
    toast.success("Photo de profil mise à jour ! 📸");
  };

  const handleRemoveAvatar = async () => {
    await updateProfile({ avatar_url: "" });
    toast.success("Photo supprimée");
  };

  const generateQR = useCallback(async () => {
    if (!currentProfile) return;
    const url = `${window.location.origin}/profile/${currentProfile.username}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 256, color: { dark: "#ffffff", light: "#00000000" }, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(""); }
  }, [currentProfile]);

  const openQR = () => {
    generateQR();
    setShowQR(true);
  };

  // Post editing
  const openEditVideo = (v: any) => {
    setEditingVideo(v);
    setEditDesc(v.description || "");
    setEditHashtags((v.hashtags || []).join(" "));
    setEditCommentsEnabled(v.comments_enabled !== false);
  };

  const saveVideoEdit = async () => {
    if (!editingVideo) return;
    const hashArr = editHashtags.split(/[#,\s]+/).filter(Boolean).map((h: string) => h.trim().toLowerCase());
    const { error } = await supabase.from("videos").update({
      description: editDesc.trim(),
      hashtags: hashArr,
      comments_enabled: editCommentsEnabled,
    }).eq("id", editingVideo.id);
    if (error) { toast.error("Erreur de mise à jour"); return; }
    toast.success("Vidéo mise à jour ✅");
    setEditingVideo(null);
    if (targetUserId) fetchVideos(targetUserId);
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm("Supprimer cette vidéo définitivement ?")) return;
    const { error } = await supabase.from("videos").delete().eq("id", videoId);
    if (error) { toast.error("Erreur de suppression"); return; }
    toast.success("Vidéo supprimée");
    setEditingVideo(null);
    if (targetUserId) {
      fetchVideos(targetUserId);
      fetchStats(targetUserId);
    }
  };

  if (!currentProfile) return null;

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toString();
  };

  const shareUrl = `${window.location.origin}/profile/${currentProfile.username}`;
  const tabs = [
    { icon: Grid3X3, label: "Vidéos" },
    { icon: Heart, label: "Aimées" },
    { icon: Bookmark, label: "Sauvegardées" },
  ];
  const showAdminBadge = (isOwnProfile && (role === "admin" || role === "super_admin")) ||
    (!isOwnProfile && viewedProfile);

  const currentTabVideos = activeTab === 0 ? videos : activeTab === 1 ? likedVideos : savedVideos;

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">@{currentProfile.username}</h1>
          {isOwnProfile && (
            <div className="flex items-center gap-2">
              <motion.button whileTap={{ scale: 0.9 }} onClick={openQR}>
                <QrCode className="h-5 w-5 text-muted-foreground" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/settings")}>
                <Settings className="h-5 w-5 text-muted-foreground" />
              </motion.button>
            </div>
          )}
        </div>

        {/* Profile info */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-3">
            <div className="h-24 w-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-primary-foreground ring-4 ring-background overflow-hidden">
              {currentProfile.avatar_url ? (
                <img src={currentProfile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                currentProfile.display_name?.[0] || "?"
              )}
            </div>
            {isOwnProfile && (
              <>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                  <Camera className="h-4 w-4 text-primary-foreground" />
                </motion.button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </>
            )}
          </div>

          {isOwnProfile && currentProfile.avatar_url && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleRemoveAvatar} className="mb-3 flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Retirer la photo
            </motion.button>
          )}

          <div className="flex items-center gap-1.5 mb-1">
            {isEditing ? (
              <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="text-lg font-bold bg-transparent text-center text-foreground outline-none border-b border-primary" />
            ) : (
              <span className="text-lg font-bold text-foreground">{currentProfile.display_name || currentProfile.username}</span>
            )}
            {(role === "admin" || role === "super_admin") && isOwnProfile && <BadgeCheck className="h-5 w-5 text-primary" />}
          </div>

          {/* Bio */}
          {isEditing ? (
            <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Ta bio... 📝" className="text-sm text-muted-foreground mb-2 text-center bg-transparent outline-none border border-border rounded-lg p-2 w-full max-w-xs resize-none" rows={3} />
          ) : (
            (currentProfile.bio && currentProfile.bio.length > 0) && (
              <p className="text-sm text-muted-foreground mb-2 text-center max-w-xs whitespace-pre-wrap">{currentProfile.bio}</p>
            )
          )}

          {/* Website */}
          {isEditing ? (
            <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="ton-site.com" className="text-xs text-accent mb-2 bg-transparent outline-none border border-border rounded-lg p-2 w-full max-w-xs" />
          ) : (
            (currentProfile.website && currentProfile.website.length > 0) && (
              <a href={normalizeWebsite(currentProfile.website)} target="_blank" rel="noreferrer" className="mb-3 text-xs font-medium text-primary underline-offset-4 hover:underline flex items-center gap-1">
                <Link2 className="h-3 w-3" /> {currentProfile.website}
              </a>
            )
          )}

          {/* Stats */}
          <div className="flex gap-6 mb-4">
            {[
              { label: "Abonnements", value: formatCount(stats.following) },
              { label: "Abonnés", value: formatCount(stats.followers) },
              { label: "J'aime", value: formatCount(stats.likes) },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-lg font-bold text-foreground tabular-nums">{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap justify-center">
            {isOwnProfile ? (
              isEditing ? (
                <>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleSaveProfile} className="rounded-lg gradient-primary px-6 py-2 text-sm font-semibold text-primary-foreground">Sauvegarder</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsEditing(false)} className="glass rounded-lg px-4 py-2 text-sm text-foreground">Annuler</motion.button>
                </>
              ) : (
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsEditing(true)} className="rounded-lg gradient-primary px-6 py-2 text-sm font-semibold text-primary-foreground">Modifier le profil</motion.button>
              )
            ) : (
              <>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleFollow} className={`rounded-lg px-6 py-2 text-sm font-semibold ${isFollowing ? "glass text-foreground" : "gradient-primary text-primary-foreground"}`}>
                  {isFollowing ? "Suivi ✓" : "Suivre"}
                </motion.button>
                {isMutual && (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleOpenConversation} disabled={openingChat} className="glass rounded-lg px-4 py-2 text-sm text-foreground disabled:opacity-60">
                    <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> {openingChat ? "..." : "Message"}</span>
                  </motion.button>
                )}
              </>
            )}
            <motion.button whileTap={{ scale: 0.95 }} className="glass rounded-lg px-4 py-2" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Lien copié ! 🔗"); }}>
              <Link2 className="h-4 w-4 text-foreground" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} className="glass rounded-lg px-4 py-2" onClick={openQR}>
              <Share2 className="h-4 w-4 text-foreground" />
            </motion.button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mb-4">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`flex-1 flex items-center justify-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${i === activeTab ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-3 gap-1">
          {currentTabVideos.length === 0 ? (
            <div className="col-span-3 text-center py-12">
              <p className="text-sm text-muted-foreground">
                {activeTab === 0 ? "Aucune vidéo publiée" : activeTab === 1 ? "Aucun j'aime" : "Aucune sauvegarde"}
              </p>
            </div>
          ) : (
            currentTabVideos.map((v: any) => (
              <motion.div
                key={v.id}
                whileTap={{ scale: 0.97 }}
                className="aspect-[9/16] rounded-lg bg-card flex items-center justify-center cursor-pointer overflow-hidden relative group"
                onClick={() => isOwnProfile && activeTab === 0 ? openEditVideo(v) : navigate(`/?video=${v.id}`)}
              >
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : v.video_url ? (
                  <video src={v.video_url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <span className="text-2xl opacity-20">▶</span>
                )}
                <div className="absolute bottom-1 left-1 flex items-center gap-1 text-[10px] text-foreground/80 bg-background/60 rounded px-1">
                  <Heart className="h-2.5 w-2.5" /> {v.likes_count || 0}
                </div>
                {isOwnProfile && activeTab === 0 && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit3 className="h-3.5 w-3.5 text-foreground drop-shadow" />
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>

        {/* QR Modal */}
        <AnimatePresence>
          {showQR && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center px-8" onClick={() => setShowQR(false)}>
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} className="glass rounded-2xl p-8 text-center max-w-xs w-full" onClick={e => e.stopPropagation()}>
                <img src={logo} alt="BARDEUR YK" className="h-12 w-12 mx-auto mb-3 rounded-xl" />
                <h3 className="text-lg font-bold text-foreground mb-1">@{currentProfile.username}</h3>
                <p className="text-xs text-muted-foreground mb-4">Scanne pour voir le profil</p>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="h-40 w-40 mx-auto rounded-xl mb-4" />
                ) : (
                  <div className="h-40 w-40 mx-auto rounded-xl bg-card flex items-center justify-center mb-4">
                    <QrCode className="h-16 w-16 text-muted-foreground animate-pulse" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground break-all">{shareUrl}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Video Modal */}
        <AnimatePresence>
          {editingVideo && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 flex items-end sm:items-center justify-center" onClick={() => setEditingVideo(null)}>
              <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="w-full max-w-md glass rounded-t-2xl sm:rounded-2xl p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-foreground">Modifier la vidéo</h3>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => setEditingVideo(null)}><X className="h-5 w-5 text-muted-foreground" /></motion.button>
                </div>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description..." className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none mb-3" rows={3} />
                <input value={editHashtags} onChange={e => setEditHashtags(e.target.value)} placeholder="#hashtags" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none mb-3" />
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setEditCommentsEnabled(!editCommentsEnabled)} className="flex items-center gap-2 w-full px-4 py-3 rounded-xl hover:bg-card mb-3">
                  {editCommentsEnabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                  <span className="text-sm text-foreground">Commentaires {editCommentsEnabled ? "activés" : "désactivés"}</span>
                </motion.button>
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={saveVideoEdit} className="flex-1 rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground">Sauvegarder</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => deleteVideo(editingVideo.id)} className="rounded-xl bg-destructive/20 px-4 py-3 text-sm font-bold text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
