import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Send, Heart } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AudioBubble from "@/components/AudioBubble";

interface LiveMsg { id: string; username: string; content: string; mediaUrl?: string; mediaType?: string; }

export default function WatchLivePage() {
  const navigate = useNavigate();
  const { id: liveId } = useParams();
  const { user } = useAuth();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [live, setLive] = useState<any>(null);
  const [streamerName, setStreamerName] = useState("");
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [hearts, setHearts] = useState<string[]>([]);

  useEffect(() => {
    if (!liveId) return;
    const fetchLive = async () => {
      const { data } = await supabase.from("lives").select("*").eq("id", liveId).single();
      if (data) {
        setLive(data);
        const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", (data as any).user_id).single();
        setStreamerName(prof?.display_name || "Live");
      }
    };
    fetchLive();

    const bumpViewer = async () => {
      const { data } = await supabase.from("lives").select("viewers_count").eq("id", liveId).single();
      await supabase.from("lives").update({ viewers_count: ((data as any)?.viewers_count || 0) + 1 }).eq("id", liveId);
    };
    bumpViewer();

    const channel = supabase
      .channel(`watch-live-${liveId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_messages", filter: `live_id=eq.${liveId}` }, (payload) => {
        const m = payload.new as any;
        setMessages(prev => [...prev.slice(-100), { id: m.id, username: m.user_id.slice(0, 8), content: m.content, mediaUrl: m.media_url || undefined, mediaType: m.media_type || undefined }]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` }, (payload) => {
        const updated = payload.new as any;
        setLive(updated);
        if (!updated.is_active) toast.info("Le live est terminé");
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [liveId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !liveId || !user) return;
    await supabase.from("live_messages").insert({ live_id: liveId, user_id: user.id, content: newMsg.trim() });
    setNewMsg("");
  };

  const sendHeart = () => {
    const id = crypto.randomUUID();
    setHearts(prev => [...prev, id]);
    setTimeout(() => setHearts(prev => prev.filter(h => h !== id)), 1500);
  };

  if (!live) return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="absolute inset-0 gradient-primary opacity-20" />
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-foreground text-lg font-bold">{streamerName} est en live 🔴</p>
      </div>

      {hearts.map(id => (
        <motion.div key={id} initial={{ opacity: 1, y: 0, x: "70vw" }} animate={{ opacity: 0, y: -200 }} transition={{ duration: 1.5 }} className="absolute bottom-40 z-30">
          <Heart className="h-8 w-8 fill-primary text-primary" />
        </motion.div>
      ))}

      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}>
          <ArrowLeft className="h-6 w-6 text-foreground drop-shadow" />
        </motion.button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
            <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-bold text-foreground">LIVE</span>
          </div>
          <div className="flex items-center gap-1 glass rounded-full px-3 py-1">
            <Users className="h-3.5 w-3.5 text-foreground" />
            <span className="text-xs font-bold text-foreground">{live.viewers_count || 0}</span>
          </div>
        </div>
        <div className="w-6" />
      </div>

      <div className="relative z-10 mt-auto max-h-[50vh] flex flex-col">
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-2 space-y-1">
          {messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-lg px-3 py-1.5 inline-block max-w-[85%]">
              <span className="text-xs font-bold text-primary">@{msg.username}</span>{" "}
              <span className="text-xs text-foreground">{msg.content}</span>
              {msg.mediaUrl && msg.mediaType?.startsWith("audio") && <div className="mt-1"><AudioBubble src={msg.mediaUrl} compact /></div>}
            </motion.div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex-1 glass rounded-full flex items-center px-4 py-2">
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Commenter..." className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={sendMessage}>
              <Send className="h-4 w-4 text-primary" />
            </motion.button>
          </div>
          <motion.button whileTap={{ scale: 1.3 }} onClick={sendHeart} className="glass rounded-full p-2.5">
            <Heart className="h-5 w-5 text-primary" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
