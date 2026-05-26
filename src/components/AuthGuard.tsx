import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { LogIn, UserPlus } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  fallbackMessage?: string;
}

export default function AuthGuard({ children, fallbackMessage = "Inscris-toi ou connecte-toi pour accéder à cette fonctionnalité" }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-background flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100svh] bg-background flex items-center justify-center px-4 mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm">
          <div className="h-20 w-20 rounded-full gradient-primary flex items-center justify-center mx-auto mb-4">
            <LogIn className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Rejoins BARDEUR YK</h2>
          <p className="text-sm text-muted-foreground mb-6">{fallbackMessage}</p>
          <div className="flex gap-2 justify-center">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/auth")}
              className="rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground pulse-glow"
            >
              <span className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> S'inscrire / Se connecter</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
