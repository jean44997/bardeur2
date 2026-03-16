import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Smile, Image, Mic, Phone, Video, MoreVertical, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  time: string;
  status: "sent" | "delivered" | "read";
  reactions: string[];
}

const mockMessages: Message[] = [
  { id: "1", text: "Hey ! T'as vu ma dernière vidéo ? 👀", fromMe: false, time: "14:23", status: "read", reactions: [] },
  { id: "2", text: "Ouiii c'est incroyable !! 🔥🔥", fromMe: true, time: "14:25", status: "read", reactions: ["❤️"] },
  { id: "3", text: "Le montage est fou, tu utilises quel logiciel ?", fromMe: true, time: "14:25", status: "read", reactions: [] },
  { id: "4", text: "Merci beaucoup ! J'utilise DaVinci Resolve + un peu de After Effects pour les transitions", fromMe: false, time: "14:28", status: "read", reactions: ["🤯"] },
  { id: "5", text: "On fait une collab ? 🤝", fromMe: false, time: "14:30", status: "read", reactions: [] },
  { id: "6", text: "Grave ! Je suis trop chaud 🚀", fromMe: true, time: "14:32", status: "delivered", reactions: ["🎉"] },
  { id: "7", text: "Let's gooo !! Je t'envoie un concept demain 💡", fromMe: false, time: "14:33", status: "read", reactions: [] },
];

const quickEmojis = ["❤️", "🔥", "😂", "😍", "👏", "🤯", "💀", "🙏"];

export default function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState(mockMessages);
  const [newMsg, setNewMsg] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [showEmojis, setShowEmojis] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Simulate typing indicator
  useEffect(() => {
    const t = setTimeout(() => setIsTyping(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const sendMessage = () => {
    if (!newMsg.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: newMsg, fromMe: true, time: "maintenant", status: "sent", reactions: [] },
    ]);
    setNewMsg("");
    // Simulate reply
    setTimeout(() => setIsTyping(true), 1500);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: "Trop cool ! 🎬✨", fromMe: false, time: "maintenant", status: "read", reactions: [] },
      ]);
    }, 3500);
  };

  const addReaction = (msgId: string, emoji: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, reactions: [...m.reactions, emoji] } : m))
    );
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "read") return <CheckCheck className="h-3 w-3 text-accent" />;
    if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    return <Check className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col h-[100svh] bg-background md:pl-[280px]">
      {/* Header */}
      <div className="glass border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/inbox")}>
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </motion.button>
        <div className="relative">
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground">
            B
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background" style={{ background: "hsl(142, 70%, 45%)" }} />
        </div>
        <div className="flex-1">
          <span className="text-sm font-semibold text-foreground">Blaze Runner</span>
          <p className="text-[10px]" style={{ color: "hsl(142, 70%, 45%)" }}>En ligne</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }}><Phone className="h-5 w-5 text-muted-foreground" /></motion.button>
          <motion.button whileTap={{ scale: 0.9 }}><Video className="h-5 w-5 text-muted-foreground" /></motion.button>
          <motion.button whileTap={{ scale: 0.9 }}><MoreVertical className="h-5 w-5 text-muted-foreground" /></motion.button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[75%]">
              <div
                className={`px-4 py-2.5 text-sm ${
                  msg.fromMe
                    ? "gradient-primary text-primary-foreground rounded-2xl rounded-br-sm"
                    : "glass text-foreground rounded-2xl rounded-bl-sm"
                }`}
              >
                {msg.text}
              </div>

              {/* Reactions */}
              {msg.reactions.length > 0 && (
                <div className={`flex gap-0.5 mt-0.5 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  {msg.reactions.map((r, i) => (
                    <span key={i} className="text-xs glass rounded-full px-1.5 py-0.5">{r}</span>
                  ))}
                </div>
              )}

              {/* Time & Status */}
              <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                {msg.fromMe && <StatusIcon status={msg.status} />}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Typing Indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex justify-start"
            >
              <div className="glass rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Emoji Quick Bar */}
      <AnimatePresence>
        {showEmojis && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 border-t border-border flex gap-2 justify-center"
          >
            {quickEmojis.map((e) => (
              <motion.button
                key={e}
                whileTap={{ scale: 1.4 }}
                onClick={() => setNewMsg((p) => p + e)}
                className="text-xl"
              >
                {e}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowEmojis((p) => !p)}>
            <Smile className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }}>
            <Image className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <div className="flex-1 glass rounded-full flex items-center px-4 py-2.5">
            <input
              type="text"
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Message..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          {newMsg.trim() ? (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={sendMessage}
              className="rounded-full p-2.5 gradient-primary"
            >
              <Send className="h-4 w-4 text-primary-foreground" />
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.85 }} className="rounded-full p-2.5 bg-secondary">
              <Mic className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
