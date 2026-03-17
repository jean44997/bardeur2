import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, User, Shield, Bell, Database, Info, Lock, Eye, EyeOff, Moon, Sun, Globe, Trash2, Download, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors ${
        danger ? "hover:bg-destructive/10" : "hover:bg-card"
      }`}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${danger ? "bg-destructive/20" : "bg-card"}`}>
        {icon}
      </div>
      <div className="flex-1 text-left">
        <span className={`text-sm font-medium ${danger ? "text-destructive" : "text-foreground"}`}>{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {toggle ? (
        <div className={`h-6 w-11 rounded-full transition-colors flex items-center px-0.5 ${value ? "bg-primary" : "bg-muted"}`}>
          <motion.div
            className="h-5 w-5 rounded-full bg-foreground"
            animate={{ x: value ? 20 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </div>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </motion.button>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [privateAccount, setPrivateAccount] = useState(false);
  const [hideLikes, setHideLikes] = useState(false);
  const [hideSaves, setHideSaves] = useState(false);
  const [invisible, setInvisible] = useState(false);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [soundNotifs, setSoundNotifs] = useState(true);

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <h1 className="text-xl font-bold text-foreground">Paramètres</h1>
        </div>

        {/* Compte */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Compte</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<User className="h-4 w-4 text-primary" />} label="Modifier le profil" onClick={() => toast.info("Bientôt disponible")} />
            <SettingItem icon={<Lock className="h-4 w-4 text-primary" />} label="Modifier le mot de passe" onClick={() => toast.info("Bientôt disponible")} />
            <SettingItem icon={<Shield className="h-4 w-4 text-accent" />} label="Authentification 2FA" description="Sécurise ton compte" onClick={() => toast.info("Bientôt disponible")} />
          </div>
        </div>

        {/* Confidentialité */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Confidentialité</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Eye className="h-4 w-4 text-primary" />} label="Compte privé" toggle value={privateAccount} onToggle={setPrivateAccount} />
            <SettingItem icon={<EyeOff className="h-4 w-4 text-muted-foreground" />} label="Masquer les j'aime" toggle value={hideLikes} onToggle={setHideLikes} />
            <SettingItem icon={<EyeOff className="h-4 w-4 text-muted-foreground" />} label="Masquer les sauvegardes" toggle value={hideSaves} onToggle={setHideSaves} />
            <SettingItem icon={<Globe className="h-4 w-4 text-accent" />} label="Mode invisible" description="Cache ton statut en ligne" toggle value={invisible} onToggle={setInvisible} />
          </div>
        </div>

        {/* Notifications */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Notifications</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Bell className="h-4 w-4 text-primary" />} label="Notifications push" toggle value={pushNotifs} onToggle={setPushNotifs} />
            <SettingItem icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Sons et vibrations" toggle value={soundNotifs} onToggle={setSoundNotifs} />
          </div>
        </div>

        {/* Données */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">Stockage et données</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Database className="h-4 w-4 text-muted-foreground" />} label="Vider le cache" onClick={() => toast.success("Cache vidé !")} />
            <SettingItem icon={<Download className="h-4 w-4 text-accent" />} label="Télécharger mes données" onClick={() => toast.info("Bientôt disponible")} />
          </div>
        </div>

        {/* À propos */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">À propos</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <SettingItem icon={<Info className="h-4 w-4 text-muted-foreground" />} label="Version 1.0.0" description="BARDEUR YK" />
          </div>
        </div>

        {/* Danger */}
        <div className="glass rounded-2xl overflow-hidden">
          <SettingItem icon={<Trash2 className="h-4 w-4 text-destructive" />} label="Supprimer mon compte" danger onClick={() => toast.error("Cette action est irréversible")} />
        </div>
      </div>
    </div>
  );
}