import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(mode === "login" ? "Connexion réussie ! 🎉" : "Compte créé ! Bienvenue sur Vanish ✨");
    navigate("/");
  };

  const socialProviders = [
    { name: "Google", icon: "G", bg: "bg-card hover:bg-card/80" },
    { name: "Apple", icon: "", bg: "bg-card hover:bg-card/80" },
    { name: "Facebook", icon: "f", bg: "bg-card hover:bg-card/80" },
  ];

  return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
          >
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              <span className="gradient-primary bg-clip-text text-transparent">Vanish</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Content de te revoir !" : "Rejoins la communauté"}
            </p>
          </motion.div>
        </div>

        {/* Social Login */}
        <div className="flex gap-2 mb-6">
          {socialProviders.map((p) => (
            <motion.button
              key={p.name}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 ${p.bg} glass rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-colors`}
            >
              <span className="text-lg">{p.icon}</span>
              {p.name}
            </motion.button>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <AnimatePresence mode="wait">
            {mode === "signup" && (
              <motion.div
                key="username"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Nom d'utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button type="button" onClick={() => setShowPassword((p) => !p)}>
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>

          {mode === "login" && (
            <div className="text-right">
              <button type="button" className="text-xs text-primary font-medium">
                Mot de passe oublié ?
              </button>
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            className="w-full rounded-xl gradient-primary py-3.5 text-sm font-bold text-primary-foreground pulse-glow"
          >
            {mode === "login" ? "Se connecter" : "Créer mon compte"}
          </motion.button>
        </form>

        {/* Toggle */}
        <div className="text-center mt-6">
          <span className="text-sm text-muted-foreground">
            {mode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}
          </span>
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-sm font-semibold text-primary"
          >
            {mode === "login" ? "S'inscrire" : "Se connecter"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
