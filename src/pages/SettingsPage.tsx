import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, User, Bell, Database, Info, Lock, Eye, EyeOff, Globe, Trash2, Download, ChevronRight, Camera, Mic, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface SettingItemProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  toggle?: boolean;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onClick?: () => void;
  danger?: boolean;
}

function SettingItem({ icon, label, description, toggle, value, onToggle, onClick, danger }: SettingItemProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        if (toggle && onToggle) onToggle(!value);
        else if (onClick) onClick();
      }}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors ${danger ? "hover:bg-destructive/10" : "hover:bg-card"}`}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${danger ? "bg-destructive/20" : "bg-card"}`}>{icon}</div>
      <div className="flex-1 text-left">
        <span className={`text-sm font-medium ${danger ? "text-destructive" : "text-foreground"}`}>{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {toggle ? (
        <div className={`h-6 w-11 rounded-full transition-colors flex items-center px-0.5 ${value ? "bg-primary" : "bg-muted"}`}>
          <motion.div className="h-5 w-5 rounded-full bg-foreground" animate={{ x: value ? 20 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
        </div>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </motion.button>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { profile, updateProfile, signOut, deleteAccount, updatePassword } = useAuth();
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [mediaPermission, setMediaPermission] = useState<"idle" | "granted" | "denied">("idle");

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleToggle = async (key: string, value: boolean) => {
    await updateProfile({ [key]: value } as any);
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmNewPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Minimum 8 caractères");
      return;
    }

    const { error } = await updatePassword(newPassword);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Mot de passe mis à jour ! 🔒");
    setShowPasswordChange(false);
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Notifications non supportées sur cet appareil");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") toast.success("Notifications autorisées");
    else toast.error("Notifications refusées");
  };

  const requestMediaPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMediaPermission("granted");
      toast.success("Caméra et micro autorisés");
    } catch {
      setMediaPermission("denied");
      toast.error("Autorisation caméra/micro refusée");
    }
  };

  const testVibration = () => {
    if (navigator.vibrate) {
      navigator.vibrate([120, 60, 120]);
      toast.success("Vibration test envoyée");
    } else {
      toast.error("Vibration non supportée sur cet appareil");
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Es-tu sûr de vouloir supprimer ton compte ? Cette action est irréversible.")) return;
    if (!confirm("Dernière chance ! Toutes tes données seront perdues.")) return;
    await deleteAccount();
    toast.success("Compte déconnecté");
    navigate("/auth");
  };

  const handleDownloadData = async () => {
    toast.info("Préparation de tes données...");
    const data = { profile };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bardeur-yk-data.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Données téléchargées !");
  };

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <h1 className="text-xl font-bold text-foreground">Paramètres</h1>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Compte</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<User className="h-4 w-4 text-primary" />} label="Modifier le profil" onClick={() => navigate("/profile")} />
            <SettingItem icon={<Lock className="h-4 w-4 text-primary" />} label="Modifier le mot de passe" onClick={() => setShowPasswordChange(p => !p)} />
            <SettingItem icon={<Shield className="h-4 w-4 text-primary" />} label="Double facteur" description="Renforcement du mot de passe activé, 2FA avancé à brancher ensuite côté authentification" />
          </div>
          {showPasswordChange && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="glass rounded-2xl p-4 mt-2 space-y-3">
              <input type="password" placeholder="Nouveau mot de passe" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <input type="password" placeholder="Confirmer" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <motion.button whileTap={{ scale: 0.97 }} onClick={handlePasswordChange} className="w-full rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground">Mettre à jour</motion.button>
            </motion.div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Confidentialité</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Eye className="h-4 w-4 text-primary" />} label="Compte privé" description="Seuls tes abonnés approuvés peuvent voir ton contenu" toggle value={profile?.is_private} onToggle={v => handleToggle("is_private", v)} />
            <SettingItem icon={<EyeOff className="h-4 w-4 text-muted-foreground" />} label="Masquer les j'aime" toggle value={profile?.hide_likes} onToggle={v => handleToggle("hide_likes", v)} />
            <SettingItem icon={<EyeOff className="h-4 w-4 text-muted-foreground" />} label="Masquer les sauvegardes" toggle value={profile?.hide_saves} onToggle={v => handleToggle("hide_saves", v)} />
            <SettingItem icon={<Globe className="h-4 w-4 text-accent" />} label="Mode invisible" description="Cache ton statut en ligne" toggle value={profile?.invisible_mode} onToggle={v => handleToggle("invisible_mode", v)} />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Notifications</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Notifications dans l'app" toggle value={profile?.push_notifications} onToggle={v => handleToggle("push_notifications", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Sons et vibrations" toggle value={profile?.sound_notifications} onToggle={v => handleToggle("sound_notifications", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label={`Autorisation navigateur : ${notificationPermission}`} description="Active les permissions système pour recevoir les alertes" onClick={requestNotificationPermission} />
            <SettingItem icon={<Bell className="h-4 w-4 text-accent" />} label="Tester la vibration" onClick={testVibration} />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Autorisations appareil</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Camera className="h-4 w-4 text-primary" />} label={`Caméra : ${mediaPermission === "granted" ? "autorisée" : mediaPermission === "denied" ? "refusée" : "à demander"}`} description="Nécessaire pour photo, vidéo et live" onClick={requestMediaPermissions} />
            <SettingItem icon={<Mic className="h-4 w-4 text-accent" />} label="Micro" description="Utilisé pour vocaux, vidéos et lives" onClick={requestMediaPermissions} />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Stockage et données</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Database className="h-4 w-4 text-muted-foreground" />} label="Vider le cache" onClick={() => { localStorage.clear(); toast.success("Cache vidé !"); }} />
            <SettingItem icon={<Download className="h-4 w-4 text-accent" />} label="Télécharger mes données" onClick={handleDownloadData} />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">À propos</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Info className="h-4 w-4 text-muted-foreground" />} label="Version 1.0.0" description="BARDEUR YK — Créé par mienthy" />
          </div>
        </div>

        <div className="space-y-2">
          <motion.button whileTap={{ scale: 0.98 }} onClick={signOut} className="flex items-center gap-3 w-full glass rounded-2xl px-4 py-3">
            <div className="h-9 w-9 rounded-lg bg-card flex items-center justify-center"><ArrowLeft className="h-4 w-4 text-muted-foreground" /></div>
            <span className="text-sm font-medium text-foreground">Se déconnecter</span>
          </motion.button>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Trash2 className="h-4 w-4 text-destructive" />} label="Supprimer mon compte" danger onClick={handleDeleteAccount} />
          </div>
        </div>
      </div>
    </div>
  );
}
