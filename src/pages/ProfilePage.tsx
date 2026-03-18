import { useState, useEffect, useRef } from "react";
import { Settings, Grid3X3, Heart, Bookmark, BadgeCheck, Share2, QrCode, Link2, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { username: paramUsername } = useParams();
  const { user, profile, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [videos, setVideos] = useState<any[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, likes: 0, videos: 0 });
  const [viewedProfile, setViewedProfile] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetUserId = isOwnProfile ? user?.id : viewedProfile?.id;

  useEffect(() => {
    if (paramUsername) {
      // Viewing someone else's profile
      fetchUserByUsername(paramUsername);
    } else if (profile) {
      setIsOwnProfile(true);
      setEditBio(profile.bio);
      setEditDisplayName(profile.display_name);
      setEditWebsite(profile.website);
    }
  }, [paramUsername, profile]);

  useEffect(() => {
    if (targetUserId) {
      fetchStats(targetUserId);
      fetchVideos(targetUserId);
    }
  }, [targetUserId]);

  const fetchUserByUsername = async (username: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("username", username).single();
    if (data) {
      setViewedProfile(data);
      setIsOwnProfile(user?.id === data.id);
      if (user && user.id !== data.id) checkFollowStatus(data.id);
    }
  };

  const checkFollowStatus = async (otherId: string) => {
    if (!user) return;
    const { data: following } = await supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", otherId).single();
    setIsFollowing(!!following);
    const { data: followedBack } = await supabase.from("follows").select("id").eq("follower_id", otherId).eq("following_id", user.id).single();
    setIsMutual(!!following && !!followedBack);
  };

  const fetchStats = async (userId: string) => {
    const [followers, following, totalLikes, videoCount] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("videos").select("likes_count").eq("user_id", userId),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    setStats({
      followers: followers.count || 0,
      following: following.count || 0,
      likes: totalLikes.data?.reduce((sum: number, v: any) => sum + (v.likes_count || 0), 0) || 0,
      videos: videoCount.count || 0,
    });
  };

  const fetchVideos = async (userId: string) => {
    const { data } = await supabase.from("videos").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (data) setVideos(data);
  };

  const handleFollow = async () => {
    if (!user || !viewedProfile) return;
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", viewedProfile.id);
      setIsFollowing(false);
      toast.success("Désabonné");
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: viewedProfile.id });
      setIsFollowing(true);
      toast.success("Abonné !");
      // Create notification
      await supabase.from("notifications").insert({ user_id: viewedProfile.id, from_user_id: user.id, type: "follow", content: "a commencé à te suivre" });
    }
    fetchStats(viewedProfile.id);
    checkFollowStatus(viewedProfile.id);
  };

  const handleSaveProfile = async () => {
    const { error } = await updateProfile({ display_name: editDisplayName, bio: editBio, website: editWebsite });
    if (error) { toast.error("Erreur lors de la sauvegarde"); return; }
    toast.success("Profil mis à jour ! ✨");
    setIsEditing(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Erreur d'upload"); return; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    await updateProfile({ avatar_url: urlData.publicUrl });
    toast.success("Photo de profil mise à jour ! 📸");
  };

  const currentProfile = isOwnProfile ? profile : viewedProfile;
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

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">@{currentProfile.username}</h1>
          {isOwnProfile && (
            <div className="flex items-center gap-2">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowQR(true)}>
                <QrCode className="h-5 w-5 text-muted-foreground" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/settings")}>
                <Settings className="h-5 w-5 text-muted-foreground" />
              </motion.button>
            </div>
          )}
        </div>

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
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
                >
                  <Camera className="h-4 w-4 text-primary-foreground" />
                </motion.button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-lg font-bold text-foreground">
              {isEditing ? (
                <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="bg-transparent text-center outline-none border-b border-primary" />
              ) : (
                currentProfile.display_name || currentProfile.username
              )}
            </span>
          </div>

          {isEditing ? (
            <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Ta bio..." className="text-sm text-muted-foreground mb-2 text-center bg-transparent outline-none border border-border rounded-lg p-2 w-full max-w-xs resize-none" rows={2} />
          ) : (
            currentProfile.bio && <p className="text-sm text-muted-foreground mb-4 text-center max-w-xs">{currentProfile.bio}</p>
          )}

          {isEditing && (
            <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="Lien site web" className="text-xs text-accent mb-2 bg-transparent outline-none border border-border rounded-lg p-2 w-full max-w-xs" />
          )}

          <div className="flex gap-8 mb-4">
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

          <div className="flex gap-2">
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
                  {isFollowing ? "Abonné" : "Suivre"}
                </motion.button>
                {isMutual && (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => toast.info("Fonctionnalité de message en cours")} className="glass rounded-lg px-4 py-2 text-sm text-foreground">Message</motion.button>
                )}
              </>
            )}
            <motion.button whileTap={{ scale: 0.95 }} className="glass rounded-lg px-4 py-2" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Lien copié ! 🔗"); }}>
              <Link2 className="h-4 w-4 text-foreground" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} className="glass rounded-lg px-4 py-2" onClick={() => setShowQR(true)}>
              <Share2 className="h-4 w-4 text-foreground" />
            </motion.button>
          </div>
        </div>

        <div className="flex border-b border-border mb-4">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`flex-1 flex items-center justify-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${i === activeTab ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1">
          {videos.length === 0 ? (
            <div className="col-span-3 text-center py-12">
              <p className="text-sm text-muted-foreground">Aucune vidéo publiée</p>
            </div>
          ) : (
            videos.map(v => (
              <motion.div key={v.id} whileTap={{ scale: 0.97 }} className="aspect-[9/16] rounded-lg bg-card flex items-center justify-center cursor-pointer overflow-hidden">
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl opacity-20">▶</span>
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
                <div className="h-40 w-40 mx-auto rounded-xl bg-foreground flex items-center justify-center mb-4">
                  <QrCode className="h-24 w-24 text-background" />
                </div>
                <p className="text-xs text-muted-foreground">{shareUrl}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
