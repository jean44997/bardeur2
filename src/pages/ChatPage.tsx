import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Smile, Image as ImageIcon, Mic, Phone, Video, Check, CheckCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  time: string;
  status: "sent" | "delivered" | "read";
  mediaUrl?: string;
  mediaType?: string;
}

const quickEmojis = ["❤️", "🔥", "😂", "😍", "👏", "🤯", "💀", "🙏"];

export default function ChatPage() {
  const navigate = useNavigate();
  const { id: conversationId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [otherUserName, setOtherUserName] = useState("Conversation");
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conversationId && user) {
      fetchMessages();
      fetchOtherUser();
      markAsRead();

      const channel = supabase
        .channel(`messages-${conversationId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
          fetchMessages();
          markAsRead();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversationId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mapMessage = (m: any): Message => ({
    id: m.id,
    text: m.content || "",
    fromMe: m.sender_id === user?.id,
    time: new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    status: m.is_read ? "read" : "delivered",
    mediaUrl: m.media_url || undefined,
    mediaType: m.media_type || undefined,
  });

  const fetchMessages = async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (data) setMessages(data.map(mapMessage));
    setLoading(false);
  };

  const fetchOtherUser = async () => {
    if (!conversationId || !user) return;
    const { data } = await supabase
      .from("conversation_participants")
      .select("profiles:user_id(display_name)")
      .eq("conversation_id", conversationId)
      .neq("user_id", user.id);
    if (data?.[0]) setOtherUserName((data[0] as any).profiles?.display_name || "Utilisateur");
  };

  const markAsRead = async () => {
    if (!conversationId || !user) return;
    await Promise.all([
      supabase
        .from("messages")
        .update({ is_read: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .eq("is_read", false),
      supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("type", "message")
        .eq("reference_id", conversationId)
        .eq("is_read", false),
    ]);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !user || !conversationId) return;
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: newMsg.trim(),
    });
    if (error) {
      toast.error("Erreur d'envoi");
      return;
    }
    setNewMsg("");
  };

  const sendImage = async (file?: File | null) => {
    if (!file || !user || !conversationId) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/chat/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: "",
        media_url: data.publicUrl,
        media_type: file.type || "image/*",
      });
      if (error) throw error;
      toast.success("Image envoyée");
    } catch {
      toast.error("Impossible d'envoyer l'image");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "read") return <CheckCheck className="h-3 w-3 text-accent" />;
    if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    return <Check className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col h-[100svh] bg-background md:pl-[var(--sidebar-width,260px)]">
      <div className="glass border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/inbox")}>
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </motion.button>
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground">
          {otherUserName[0]}
        </div>
        <div className="flex-1">
          <span className="text-sm font-semibold text-foreground">{otherUserName}</span>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => toast.info("Appels bientôt disponibles")}>
            <Phone className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => toast.info("Appels vidéo bientôt disponibles")}>
            <Video className="h-5 w-5 text-muted-foreground" />
          </motion.button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Dis bonjour ! 👋</p>
        ) : (
          messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[75%]">
                <div className={`px-4 py-2.5 text-sm ${msg.fromMe ? "gradient-primary text-primary-foreground rounded-2xl rounded-br-sm" : "glass text-foreground rounded-2xl rounded-bl-sm"}`}>
                  {msg.mediaUrl && msg.mediaType?.startsWith("image") && (
                    <img src={msg.mediaUrl} alt="Pièce jointe" className="mb-2 max-h-64 w-full rounded-xl object-cover" />
                  )}
                  {msg.text}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                  {msg.fromMe && <StatusIcon status={msg.status} />}
                </div>
              </div>
            </motion.div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <AnimatePresence>
        {showEmojis && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 py-2 border-t border-border flex gap-2 justify-center">
            {quickEmojis.map(e => (
              <motion.button key={e} whileTap={{ scale: 1.4 }} onClick={() => setNewMsg(p => p + e)} className="text-xl">{e}</motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => sendImage(e.target.files?.[0])} />
        <div className="flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowEmojis(p => !p)}>
            <Smile className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <div className="flex-1 glass rounded-full flex items-center px-4 py-2.5">
            <input
              type="text"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Message..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          {newMsg.trim() ? (
            <motion.button whileTap={{ scale: 0.85 }} onClick={sendMessage} className="rounded-full p-2.5 gradient-primary">
              <Send className="h-4 w-4 text-primary-foreground" />
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.85 }} className="rounded-full p-2.5 bg-secondary" onClick={() => toast.info("Message vocal à brancher ensuite")}>
              <Mic className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
