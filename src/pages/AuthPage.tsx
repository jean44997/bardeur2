import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.png";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { signUp, signIn, resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await resetPassword(email);
        if (error) { toast.error(error.message); return; }
        toast.success("Email de réinitialisation envoyé ! 📧 Vérifie ta boîte mail.");
        setMode("login");
        return;
      }

      if (mode === "signup") {
        if (password !== confirmPassword) {
          toast.error("Les mots de passe ne correspondent pas !");
          return;
        }
        if (password.length < 6) {
          toast.error("Le mot de passe doit contenir au moins 6 caractères");
          return;
        }
        if (!username.trim()) {
          toast.error("Le nom d'utilisateur est requis");
          return;
        }
        const { error } = await signUp(email, password, username.trim());
        if (error) { toast.error(error.message); return; }
        toast.success("Compte créé ! Vérifie ton email pour confirmer ton inscription ✉️");
        setMode("login");
        return;
      }

      const { error } = await signIn(email, password);
      if (error) { toast.error(error.message); return; }
      toast.success("Connexion réussie ! 🎉");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* 3D Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-[0.03]"
          style={{
            background: "conic-gradient(from 0deg, hsl(330, 100%, 60%), hsl(190, 100%, 50%), hsl(330, 100%, 60%))",
          }}
        />
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 100 + i * 60,
              height: 100 + i * 60,
              left: `${10 + i * 15}%`,
              top: `${5 + i * 12}%`,
              background: `radial-gradient(circle, hsl(${330 + i * 30}, 100%, 60% / 0.08), transparent)`,
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, 15, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 6 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, rotateX: 5 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: "1000px" }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.5, rotateY: -30 }}
            animate={{ scale: 1, rotateY: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
            className="flex flex-col items-center"
          >
            <motion.div
              className="relative mb-4"
              animate={{ rotateY: [0, 5, 0, -5, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <img src={logo} alt="BARDEUR YK" className="h-20 w-20 rounded-2xl shadow-2xl" />
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{ background: "var(--gradient-primary)", opacity: 0.3 }}
                animate={{ opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </motion.div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-1">
              <span className="gradient-primary bg-clip-text text-transparent">BARDEUR</span>
              <span className="text-foreground ml-2">YK</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <p className="text-sm text-muted-foreground">
                {mode === "login" ? "Content de te revoir !" : mode === "signup" ? "Rejoins la communauté 🚀" : "Réinitialise ton mot de passe"}
              </p>
            </div>
          </motion.div>
        </div>

        {mode === "forgot" ? (
          <motion.form
            key="forgot"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onSubmit={handleSubmit}
            className="space-y-3"
          >
            <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input type="email" placeholder="Ton email" value={email} onChange={(e) => setEmail(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
            <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={isLoading} className="w-full rounded-xl gradient-primary py-3.5 text-sm font-bold text-primary-foreground pulse-glow disabled:opacity-50">
              {isLoading ? "Envoi..." : "Envoyer le lien de réinitialisation"}
            </motion.button>
            <button type="button" onClick={() => setMode("login")} className="flex items-center gap-1 text-sm text-primary font-medium mx-auto mt-2">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
          </motion.form>
        ) : (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">Connexion par email</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <AnimatePresence mode="wait">
                {mode === "signup" && (
                  <motion.div key="username" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <input type="text" placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              </div>

              <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input type={showPassword ? "text" : "password"} placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                <button type="button" onClick={() => setShowPassword((p) => !p)}>
                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>

              <AnimatePresence mode="wait">
                {mode === "signup" && (
                  <motion.div key="confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <input type="password" placeholder="Confirmer le mot de passe" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {mode === "login" && (
                <div className="text-right">
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary font-medium">Mot de passe oublié ?</button>
                </div>
              )}

              <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={isLoading} className="w-full rounded-xl gradient-primary py-3.5 text-sm font-bold text-primary-foreground pulse-glow disabled:opacity-50">
                {isLoading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
              </motion.button>
            </form>

            <div className="text-center mt-6">
              <span className="text-sm text-muted-foreground">{mode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}</span>
              <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-sm font-semibold text-primary">
                {mode === "login" ? "S'inscrire" : "Se connecter"}
              </button>
            </div>
          </motion.div>
        )}

        {/* About */}
        <p className="text-center text-[10px] text-muted-foreground mt-8">
          BARDEUR YK v1.0.0 — Créé par mienthy
        </p>
      </motion.div>
    </div>
  );
}
