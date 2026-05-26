import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLogo from "@/components/AppLogo";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  useEffect(() => {
    // Check for recovery token in URL
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      // Also check via session
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else navigate("/auth");
      });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    if (password.length < 6) { toast.error("Minimum 6 caractères"); return; }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Mot de passe mis à jour ! 🔒");
    navigate("/");
  };

  if (!ready) return null;

  return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AppLogo className="mx-auto mb-3 h-16 w-16" markClassName="text-2xl" />
          <h1 className="text-2xl font-bold text-foreground">Nouveau mot de passe</h1>
          <p className="text-sm text-muted-foreground mt-1">Choisis un mot de passe sécurisé</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <input type={show ? "text" : "password"} placeholder="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            <button type="button" onClick={() => setShow(p => !p)}>
              {show ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
          <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <input type="password" placeholder="Confirmer le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading} className="w-full rounded-xl gradient-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {loading ? "Mise à jour..." : "Mettre à jour"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
