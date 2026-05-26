import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AppLogo from "@/components/AppLogo";

function Particle({ delay }: { delay: number }) {
  const x = Math.random() * 100;
  const size = 2 + Math.random() * 4;
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: `${x}%`,
        bottom: -10,
        background: `hsl(${330 + Math.random() * 60}, 100%, ${50 + Math.random() * 20}%)`,
      }}
      initial={{ y: 0, opacity: 0 }}
      animate={{ y: -window.innerHeight * 1.2, opacity: [0, 0.8, 0] }}
      transition={{ duration: 6 + Math.random() * 6, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

function FloatingOrb({ index }: { index: number }) {
  const colors = ["hsl(330,100%,60%)", "hsl(190,100%,50%)", "hsl(270,80%,60%)", "hsl(350,90%,55%)"];
  return (
    <motion.div
      className="absolute rounded-full blur-3xl"
      style={{
        width: 120 + index * 80,
        height: 120 + index * 80,
        background: `radial-gradient(circle, ${colors[index % colors.length]}22, transparent 70%)`,
        left: `${15 + index * 20}%`,
        top: `${10 + index * 15}%`,
      }}
      animate={{
        x: [0, 40, -20, 0],
        y: [0, -50, 20, 0],
        scale: [1, 1.2, 0.9, 1],
        rotateZ: [0, 90, 180, 360],
      }}
      transition={{ duration: 12 + index * 4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D Canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      time += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw 3D grid lines
      ctx.strokeStyle = "hsla(330, 100%, 60%, 0.06)";
      ctx.lineWidth = 1;
      const gridSize = 60;
      const perspective = 400;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        for (let z = 1; z < 20; z++) {
          const scale = perspective / (perspective + z * gridSize);
          const sx = cx + i * gridSize * scale;
          const sy = cy + (z * gridSize - 300) * scale * 0.5;
          if (z === 1) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Rotating rings
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        const radius = 100 + r * 60;
        const offsetX = Math.sin(time + r) * 30;
        const offsetY = Math.cos(time * 0.7 + r) * 20;
        ctx.ellipse(cx + offsetX, cy * 0.4 + offsetY, radius, radius * 0.3, time + r * 1.2, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${330 + r * 40}, 100%, 60%, ${0.08 - r * 0.02})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await resetPassword(email);
        if (error) { toast.error(error.message); return; }
        toast.success("Email de réinitialisation envoyé ! 📧");
        setMode("login");
        return;
      }
      if (mode === "signup") {
        if (password !== confirmPassword) { toast.error("Les mots de passe ne correspondent pas !"); return; }
        if (password.length < 6) { toast.error("Le mot de passe doit contenir au moins 6 caractères"); return; }
        if (!username.trim()) { toast.error("Le nom d'utilisateur est requis"); return; }
        const { error } = await signUp(email, password, username.trim());
        if (error) { toast.error(error.message); return; }
        toast.success("Compte créé ! Vérifie ton email ✉️");
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
      {/* 3D Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Floating Orbs */}
      {[0, 1, 2, 3].map(i => <FloatingOrb key={i} index={i} />)}

      {/* Rising Particles */}
      {Array.from({ length: 20 }, (_, i) => (
        <Particle key={i} delay={i * 0.4} />
      ))}

      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, hsl(240 10% 3.9%) 100%)" }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: "1200px" }}
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
              animate={{ rotateY: [0, 10, 0, -10, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <AppLogo className="h-20 w-20" markClassName="text-3xl" />
              <motion.div
                className="absolute inset-0 rounded-2xl gradient-primary"
                style={{ opacity: 0.25 }}
                animate={{ opacity: [0.15, 0.35, 0.15] }}
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
          <motion.form key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onSubmit={handleSubmit} className="space-y-3">
            <div className="glass rounded-xl flex items-center gap-3 px-4 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input type="email" placeholder="Ton email" value={email} onChange={(e) => setEmail(e.target.value)} required className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
            <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={isLoading} className="w-full rounded-xl gradient-primary py-3.5 text-sm font-bold text-primary-foreground pulse-glow disabled:opacity-50">
              {isLoading ? "Envoi..." : "Envoyer le lien"}
            </motion.button>
            <button type="button" onClick={() => setMode("login")} className="flex items-center gap-1 text-sm text-primary font-medium mx-auto mt-2">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
          </motion.form>
        ) : (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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

              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl gradient-primary py-3.5 text-sm font-bold text-primary-foreground pulse-glow disabled:opacity-50"
              >
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

        <p className="text-center text-[10px] text-muted-foreground mt-8">
          BARDEUR YK v1.0.0 — Créé par mienthy
        </p>
      </motion.div>
    </div>
  );
}
