import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, User, Bell, Database, Info, Lock, Eye, EyeOff, Globe, Trash2, Download, ChevronRight, Camera, Mic, Shield, Mail, Smartphone, CheckCircle2, AlertCircle, Activity, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { probeAudioCodecs, isIOSDevice } from "@/lib/mediaCapabilities";

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
  const [mfaQr, setMfaQr] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMethod, setMfaMethod] = useState<"email" | "phone">("email");
  const [mfaPhone, setMfaPhone] = useState("");
  const [mfaStatus, setMfaStatus] = useState<"idle" | "sending" | "waiting" | "checking" | "verified" | "error">("idle");
  const [mfaMessage, setMfaMessage] = useState("Choisis une méthode puis vérifie le code en temps réel.");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaActiveLabel, setMfaActiveLabel] = useState("Désactivée");
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [mediaPermission, setMediaPermission] = useState<"idle" | "granted" | "denied">("idle");
  const [showAboutDetails, setShowAboutDetails] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
    loadMfaStatus();
  }, []);

  const loadMfaStatus = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const factors = [...((data as any)?.totp || []), ...((data as any)?.phone || [])];
    const verified = factors.filter((f: any) => f.status === "verified");
    setMfaFactors(factors);
    setMfaEnabled(verified.length > 0);
    setMfaActiveLabel(verified.length ? `Activée · ${verified[0].factor_type === "phone" ? "numéro" : "email/app"}` : factors.length ? "En cours" : "Désactivée");
  };

  const handleToggle = async (key: string, value: boolean) => {
    const { error } = await updateProfile({ [key]: value } as any);
    if (error) toast.error("Reglage impossible: applique la derniere migration Supabase");
    else toast.success(value ? "Reglage active" : "Reglage desactive");
  };

  const updateNotificationSound = async (sound: "pop" | "soft" | "none") => {
    await updateProfile({ notification_sound: sound } as any);
    toast.success(sound === "none" ? "Sons personnalisés désactivés" : `Son ${sound} activé`);
  };

  const enableAllNotifications = async () => {
    await updateProfile({
      push_notifications: true,
      sound_notifications: true,
      notify_messages: true,
      notify_likes: true,
      notify_comments: true,
      notify_follows: true,
      notify_shares: true,
      notify_mentions: true,
      notification_quiet_hours_enabled: false,
      notification_sound: "pop",
    } as any);
    toast.success("Toutes les notifications utiles sont activées");
    if (notificationPermission !== "granted") await requestNotificationPermission();
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

  const startMfaSetup = async () => {
    setMfaStatus("sending");
    setMfaMessage("Préparation du code sécurisé...");
    if (mfaMethod === "phone" && mfaPhone.trim().length < 8) {
      setMfaStatus("error");
      setMfaMessage("Ajoute un numéro complet avec indicatif pays (ex : +2250102030405).");
      return;
    }
    const enrollOptions = mfaMethod === "phone"
      ? ({ factorType: "phone", phone: mfaPhone.trim() } as any)
      : ({ factorType: "totp" } as const);
    const { data, error } = await supabase.auth.mfa.enroll(enrollOptions);
    if (error) {
      setMfaStatus("error");
      const msg = (error.message || "").toLowerCase();
      if (mfaMethod === "phone" && (msg.includes("provider") || msg.includes("sms") || msg.includes("not enabled") || msg.includes("phone") || msg.includes("twilio"))) {
        setMfaMessage("SMS 2FA indisponible sur ce backend : opérateur/SMS non configuré ou refusé. Solution immédiate : choisis « Email/app » puis scanne le QR code avec Google Authenticator/Authy. Tu peux réessayer le numéro plus tard sans bloquer ton compte.");
      } else {
        setMfaMessage(error.message || "Double authentification indisponible.");
      }
      toast.error("Double authentification indisponible");
      return;
    }
    setMfaFactorId(data.id);
    setMfaQr((data as any).totp?.qr_code || "");
    setMfaStatus("waiting");
    setMfaMessage(mfaMethod === "phone" ? "Code envoyé par SMS. Entre-le ci-dessous pour activer la 2FA." : "Scanne le QR code avec Google Authenticator (ou Authy), puis entre le code à 6 chiffres affiché.");
  };

  const verifyMfaSetup = async () => {
    if (!mfaFactorId || !mfaCode.trim()) return;
    setMfaStatus("checking");
    setMfaMessage("Vérification du code en cours...");
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challengeError) { setMfaStatus("error"); setMfaMessage("Code impossible à vérifier, réessaie."); toast.error("Code 2FA impossible à vérifier"); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.trim() });
    if (error) { setMfaStatus("error"); setMfaMessage("Code incorrect ou expiré."); toast.error("Code 2FA incorrect"); return; }
    setMfaStatus("verified");
    setMfaMessage("Double authentification activée sur ce compte.");
    toast.success("Double authentification activée 🔐");
    setMfaQr("");
    setMfaFactorId("");
    setMfaCode("");
    loadMfaStatus();
  };

  const revokeMfa = async () => {
    const factor = mfaFactors.find((f: any) => f.status === "verified") || mfaFactors[0];
    if (!factor) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) { toast.error("Révocation impossible"); return; }
    setMfaStatus("idle");
    setMfaMessage("Méthode révoquée. Tu peux en choisir une nouvelle.");
    await loadMfaStatus();
    toast.success("Double authentification désactivée");
  };

  const changeMfaMethod = async () => {
    if (mfaFactors.length) await revokeMfa();
    setMfaStatus("waiting");
    setMfaFactorId("");
    setMfaQr("");
    setMfaCode("");
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Notifications non supportées sur cet appareil");
      return;
    }

    if (Notification.permission !== "default") {
      setNotificationPermission(Notification.permission);
      toast.info(Notification.permission === "granted" ? "Notifications deja autorisees" : "Notifications deja refusees dans le navigateur");
      return;
    }
    if (localStorage.getItem("permission-prompt:notifications") === "asked") {
      toast.info("Demande deja faite une fois. Change l'autorisation dans les reglages du navigateur si besoin.");
      return;
    }
    localStorage.setItem("permission-prompt:notifications", "asked");
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") toast.success("Notifications autorisées");
    else toast.error("Notifications refusées");
  };

  const requestMediaPermissions = async () => {
    if (localStorage.getItem("permission-prompt:media") === "denied") {
      setMediaPermission("denied");
      toast.info("Camera/micro deja refuses. Active-les dans les reglages du navigateur pour eviter une nouvelle demande.");
      return;
    }
    try {
      localStorage.setItem("permission-prompt:media", "asked");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMediaPermission("granted");
      localStorage.setItem("permission-prompt:media", "granted");
      toast.success("Caméra et micro autorisés");
    } catch {
      setMediaPermission("denied");
      localStorage.setItem("permission-prompt:media", "denied");
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
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-lg px-4">
        <div className="flex items-center gap-3 mb-6">
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="tap-target-lg glass-action grid place-items-center rounded-full" aria-label="Retour">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <h1 className="text-xl font-bold text-foreground">Paramètres</h1>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Compte</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<User className="h-4 w-4 text-primary" />} label="Modifier le profil" onClick={() => navigate("/profile")} />
            <SettingItem icon={<Lock className="h-4 w-4 text-primary" />} label="Modifier le mot de passe" onClick={() => setShowPasswordChange(p => !p)} />
            <SettingItem icon={<Shield className="h-4 w-4 text-primary" />} label={`Double facteur : ${mfaActiveLabel}`} description="Optionnel : email/app ou numéro, avec statuts et code vérifié en direct" onClick={() => setMfaStatus(s => s === "idle" ? "waiting" : "idle")} />
          </div>
          {mfaStatus !== "idle" && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="glass rounded-2xl p-4 mt-2 space-y-3 text-center">
              <div className="flex items-center justify-between rounded-xl bg-card px-3 py-2 text-left">
                <span className="text-xs font-bold text-foreground">État 2FA</span>
                <span className={`text-xs font-bold ${mfaEnabled ? "text-primary" : mfaActiveLabel === "En cours" ? "text-accent" : "text-muted-foreground"}`}>{mfaActiveLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMfaMethod("email")} className={`rounded-xl px-3 py-2 text-xs font-bold ${mfaMethod === "email" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}><Mail className="mx-auto mb-1 h-4 w-4" />Email/app</button>
                <button onClick={() => setMfaMethod("phone")} className={`rounded-xl px-3 py-2 text-xs font-bold ${mfaMethod === "phone" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}><Smartphone className="mx-auto mb-1 h-4 w-4" />Numéro</button>
              </div>
              {mfaMethod === "phone" && <input inputMode="tel" placeholder="+2250102030405" value={mfaPhone} onChange={e => setMfaPhone(e.target.value)} className="w-full glass rounded-xl px-4 py-3 bg-transparent text-center text-sm text-foreground placeholder:text-muted-foreground outline-none" />}
              {mfaQr && <img src={mfaQr} alt="QR code double authentification" className="mx-auto h-44 w-44 rounded-xl bg-foreground p-2" />}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {mfaStatus === "verified" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : mfaStatus === "error" ? <AlertCircle className="h-4 w-4 text-destructive" /> : <Shield className="h-4 w-4 text-accent" />}
                <span>{mfaMessage}</span>
              </div>
              {!mfaFactorId ? <motion.button whileTap={{ scale: 0.97 }} onClick={startMfaSetup} disabled={mfaStatus === "sending"} className="w-full rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground">Recevoir / préparer le code</motion.button> : null}
              {mfaFactorId && <input inputMode="numeric" maxLength={6} placeholder="Code à 6 chiffres" value={mfaCode} onChange={e => { const value = e.target.value.replace(/\D/g, "").slice(0, 6); setMfaCode(value); if (value.length === 6) setTimeout(verifyMfaSetup, 150); }} className="w-full glass rounded-xl px-4 py-3 bg-transparent text-center text-sm text-foreground placeholder:text-muted-foreground outline-none" />}
              {mfaFactorId && <motion.button whileTap={{ scale: 0.97 }} onClick={verifyMfaSetup} disabled={mfaStatus === "checking" || mfaCode.length < 6} className="w-full rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground">Vérifier maintenant</motion.button>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={changeMfaMethod} className="rounded-xl bg-card px-3 py-2 text-xs font-bold text-foreground">Changer méthode</button>
                <button onClick={revokeMfa} disabled={!mfaFactors.length} className="rounded-xl bg-destructive/20 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-40">Révoquer</button>
              </div>
            </motion.div>
          )}
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
            <SettingItem icon={<EyeOff className="h-4 w-4 text-muted-foreground" />} label="Masquer tes abonnements" description="Les autres ne voient plus qui tu suis" toggle value={(profile as any)?.hide_following === true} onToggle={v => handleToggle("hide_following", v)} />
            <SettingItem icon={<Eye className="h-4 w-4 text-primary" />} label="Historique visites profil" description="Active le panneau qui regarde ton profil" toggle value={(profile as any)?.allow_profile_views !== false} onToggle={v => handleToggle("allow_profile_views", v)} />
            <SettingItem icon={<Globe className="h-4 w-4 text-accent" />} label="Mode invisible" description="Cache ton statut en ligne" toggle value={profile?.invisible_mode} onToggle={v => handleToggle("invisible_mode", v)} />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Notifications</h2>
          <button type="button" onClick={enableAllNotifications} className="mb-2 w-full rounded-xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground">
            Tout activer proprement
          </button>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Notifications dans l'app" toggle value={profile?.push_notifications} onToggle={v => handleToggle("push_notifications", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Sons et vibrations" toggle value={profile?.sound_notifications} onToggle={v => handleToggle("sound_notifications", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Messages" description="Alertes de conversations et vocaux" toggle value={profile?.notify_messages !== false} onToggle={v => handleToggle("notify_messages", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="J'aime et favoris" toggle value={profile?.notify_likes !== false} onToggle={v => handleToggle("notify_likes", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Commentaires" toggle value={profile?.notify_comments !== false} onToggle={v => handleToggle("notify_comments", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Abonnements" toggle value={profile?.notify_follows !== false} onToggle={v => handleToggle("notify_follows", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Partages et mentions" toggle value={profile?.notify_shares !== false && profile?.notify_mentions !== false} onToggle={v => { handleToggle("notify_shares", v); handleToggle("notify_mentions", v); }} />
            <SettingItem icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Ne pas déranger 22h-08h" description="Coupe les sons et notifications navigateur pendant la nuit" toggle value={profile?.notification_quiet_hours_enabled === true} onToggle={v => handleToggle("notification_quiet_hours_enabled", v)} />
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label={`Autorisation navigateur : ${notificationPermission}`} description="Active les permissions système pour recevoir les alertes" onClick={requestNotificationPermission} />
            <SettingItem icon={<Bell className="h-4 w-4 text-accent" />} label="Tester la vibration" onClick={testVibration} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["pop", "soft", "none"] as const).map(sound => (
              <button key={sound} onClick={() => updateNotificationSound(sound)} className={`rounded-xl px-3 py-2 text-xs font-bold ${((profile as any)?.notification_sound || "pop") === sound ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                {sound === "none" ? "Silence" : sound === "soft" ? "Doux" : "Pop"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Monetisation et abonnements</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem
              icon={<WalletCards className="h-4 w-4 text-primary" />}
              label="Centre monetisation"
              description="Rewards, retraits, pubs, abonnements et checklist createur"
              onClick={() => navigate("/monetization")}
            />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Autorisations appareil</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Camera className="h-4 w-4 text-primary" />} label={`Caméra : ${mediaPermission === "granted" ? "autorisée" : mediaPermission === "denied" ? "refusée" : "à demander"}`} description="Nécessaire pour photo, vidéo et live" onClick={requestMediaPermissions} />
            <SettingItem icon={<Mic className="h-4 w-4 text-accent" />} label="Micro" description="Utilisé pour vocaux, vidéos et lives" onClick={requestMediaPermissions} />
            <SettingItem
              icon={<Mic className="h-4 w-4 text-primary" />}
              label="Mode audio iOS / codecs"
              description={isIOSDevice() ? "Appareil iOS détecté — teste le fallback compatible" : "Teste les codecs MediaRecorder et active le fallback"}
              onClick={() => {
                const probe = probeAudioCodecs();
                if (!probe.supported.length) {
                  toast.error("Aucun codec audio compatible détecté");
                } else {
                  toast.success(`Codec actif : ${probe.chosen}`, { description: `Compatibles : ${probe.supported.join(", ")}` });
                }
              }}
            />
            <SettingItem icon={<Activity className="h-4 w-4 text-primary" />} label="Debug live" description="Réseau, reconnect, buffer audio et erreurs mobile/iOS" onClick={() => navigate("/settings/live-debug")} />
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
            <SettingItem icon={<Info className="h-4 w-4 text-muted-foreground" />} label="Version 1.0.0" description="BARDEUR YK - politiques, securite et aide createur" onClick={() => setShowAboutDetails(p => !p)} />
          </div>
          {showAboutDetails && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-2 rounded-2xl border border-border bg-card/80 p-4">
              {[
                ["Politique", "Confidentialite, donnees de profil, liens bio, contenus publics/prives et demandes de suppression."],
                ["Securite", "2FA, mot de passe, sessions, signalement, blocage, anti-spam, anti-abus et verification des paiements."],
                ["Creation", "Formats 9:16, HD/4K conservee, droits audio, partenariats, commentaires, remix, stitch, lives et stories."],
                ["Monetisation", "Abonnements, retrait, campagnes de promotion, contenu sponsorise, eligibility rewards et lutte anti-fraude."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl bg-background/60 px-3 py-2">
                  <p className="text-xs font-bold text-foreground">{title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </motion.div>
          )}
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
