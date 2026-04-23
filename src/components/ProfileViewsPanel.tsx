import { AnimatePresence, motion } from "framer-motion";
import { Eye, UserRound, X } from "lucide-react";

interface ViewerItem {
  id: string;
  viewedAt: string;
  viewer: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
}

interface ProfileViewsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  viewers: ViewerItem[];
  onOpenProfile: (username: string) => void;
}

export default function ProfileViewsPanel({ isOpen, onClose, viewers, onOpenProfile }: ProfileViewsPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80" onClick={onClose} />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 280, damping: 30 }} className="fixed inset-x-0 bottom-0 z-[60] max-h-[75svh] rounded-t-3xl glass p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Qui a vu ton profil</h3>
              </div>
              <button onClick={onClose} className="rounded-full bg-card p-2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1">
              {viewers.length === 0 ? (
                <div className="grid h-28 place-items-center rounded-2xl bg-card/80 px-4 text-center text-sm text-muted-foreground">
                  Aucun visiteur récent pour le moment.
                </div>
              ) : (
                viewers.map((entry) => (
                  <button key={entry.id} onClick={() => onOpenProfile(entry.viewer.username)} className="flex w-full items-center gap-3 rounded-2xl bg-card/80 px-3 py-3 text-left">
                    <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full gradient-primary text-sm font-bold text-primary-foreground">
                      {entry.viewer.avatarUrl ? <img src={entry.viewer.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{entry.viewer.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">@{entry.viewer.username}</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {new Date(entry.viewedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}