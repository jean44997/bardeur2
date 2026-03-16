import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Send, Smile, Sticker, ChevronDown } from "lucide-react";

interface Comment {
  id: string;
  user: { name: string; avatar: string; verified: boolean };
  text: string;
  likes: number;
  liked: boolean;
  time: string;
  replies: number;
  reactions: string[];
}

const mockComments: Comment[] = [
  { id: "1", user: { name: "luna.xo", avatar: "L", verified: true }, text: "C'est tellement satisfaisant 😍🔥", likes: 2431, liked: false, time: "2h", replies: 14, reactions: ["🔥", "❤️"] },
  { id: "2", user: { name: "maxvibes", avatar: "M", verified: false }, text: "J'ai regardé ça en boucle pendant 10 minutes 😂", likes: 892, liked: true, time: "4h", replies: 3, reactions: ["😂"] },
  { id: "3", user: { name: "créatif.studio", avatar: "C", verified: true }, text: "Le montage est incroyable ! Comment tu fais ça ?", likes: 456, liked: false, time: "6h", replies: 8, reactions: ["🤯", "👏"] },
  { id: "4", user: { name: "zoefleur", avatar: "Z", verified: false }, text: "Tutorial svp !! 🙏✨", likes: 234, liked: false, time: "8h", replies: 1, reactions: ["🙏"] },
  { id: "5", user: { name: "techguru", avatar: "T", verified: true }, text: "La qualité 4K 🤌 chef's kiss", likes: 178, liked: false, time: "12h", replies: 0, reactions: ["🤌"] },
  { id: "6", user: { name: "artiste.fou", avatar: "A", verified: false }, text: "Je pourrais collaborer avec toi ? DM ouvert 💜", likes: 89, liked: false, time: "1j", replies: 2, reactions: [] },
];

const quickReactions = ["❤️", "🔥", "😂", "😍", "🤯", "👏", "💀", "😭"];
const stickerPacks = ["🎉", "🦄", "🌈", "⚡", "💎", "🎭", "🎪", "🚀", "🌟", "🎯", "🎨", "🎵"];

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  commentCount: number;
}

export default function CommentsDrawer({ isOpen, onClose, commentCount }: CommentsDrawerProps) {
  const [comments, setComments] = useState(mockComments);
  const [newComment, setNewComment] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleLike = (id: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 } : c
      )
    );
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    const c: Comment = {
      id: crypto.randomUUID(),
      user: { name: "monprofil", avatar: "V", verified: false },
      text: newComment,
      likes: 0,
      liked: false,
      time: "maintenant",
      replies: 0,
      reactions: [],
    };
    setComments((prev) => [c, ...prev]);
    setNewComment("");
  };

  const addReaction = (commentId: string, emoji: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, reactions: [...c.reactions, emoji] } : c
      )
    );
    setShowReactions(null);
  };

  const formatLikes = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toString());

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-background/60"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[75svh] rounded-t-3xl bg-card border-t border-border flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-bold text-foreground tabular-nums">
                {commentCount.toLocaleString()} commentaires
              </span>
              <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}>
                <X className="h-5 w-5 text-muted-foreground" />
              </motion.button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  {/* Avatar */}
                  <div className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
                    {comment.user.avatar}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-foreground">{comment.user.name}</span>
                      {comment.user.verified && <span className="text-accent text-[10px]">✓</span>}
                      <span className="text-[10px] text-muted-foreground">{comment.time}</span>
                    </div>
                    <p className="text-sm text-foreground/90 mb-1">{comment.text}</p>

                    {/* Reactions */}
                    {comment.reactions.length > 0 && (
                      <div className="flex gap-1 mb-1.5">
                        {[...new Set(comment.reactions)].map((r, i) => (
                          <span key={i} className="glass rounded-full px-1.5 py-0.5 text-xs">
                            {r} {comment.reactions.filter((x) => x === r).length > 1 && comment.reactions.filter((x) => x === r).length}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => toggleLike(comment.id)}
                        className="flex items-center gap-1"
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${comment.liked ? "fill-primary text-primary" : "text-muted-foreground"}`}
                        />
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatLikes(comment.likes)}
                        </span>
                      </button>
                      <button className="text-[10px] font-medium text-muted-foreground">
                        Répondre {comment.replies > 0 && `(${comment.replies})`}
                      </button>
                      <button
                        onClick={() => setShowReactions(showReactions === comment.id ? null : comment.id)}
                        className="text-muted-foreground"
                      >
                        <Smile className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Quick Reactions */}
                    <AnimatePresence>
                      {showReactions === comment.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="glass rounded-xl px-2 py-1.5 mt-2 flex gap-1"
                        >
                          {quickReactions.map((emoji) => (
                            <motion.button
                              key={emoji}
                              whileTap={{ scale: 1.4 }}
                              onClick={() => addReaction(comment.id, emoji)}
                              className="text-lg hover:scale-125 transition-transform px-0.5"
                            >
                              {emoji}
                            </motion.button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>

            {/* Sticker Picker */}
            <AnimatePresence>
              {showStickers && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border px-4 py-3"
                >
                  <div className="grid grid-cols-6 gap-2">
                    {stickerPacks.map((s) => (
                      <motion.button
                        key={s}
                        whileTap={{ scale: 1.3 }}
                        onClick={() => {
                          setNewComment((p) => p + s);
                          setShowStickers(false);
                        }}
                        className="text-2xl glass rounded-lg py-2 hover:scale-110 transition-transform"
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                  V
                </div>
                <div className="flex-1 glass rounded-full flex items-center px-3 py-2 gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Ajouter un commentaire..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  <button onClick={() => setShowStickers((p) => !p)}>
                    <Sticker className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={addComment}
                  className={`rounded-full p-2 transition-colors ${newComment.trim() ? "gradient-primary" : "bg-secondary"}`}
                >
                  <Send className={`h-4 w-4 ${newComment.trim() ? "text-primary-foreground" : "text-muted-foreground"}`} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
