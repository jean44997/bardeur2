import { useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { decryptMessageContent, isEncryptedContent } from "@/lib/messageCrypto";

interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

export default function InboxPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (user) fetchConversations();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` }, () => fetchConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchConversations = async () => {
    if (!user) return;
    setLoading(true);

    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = participations.map((p: any) => p.conversation_id);
    const convos: Conversation[] = [];

    for (const convId of convIds) {
      // Get other participant
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id, profiles:user_id(username, display_name, avatar_url)")
        .eq("conversation_id", convId)
        .neq("user_id", user.id);

      const otherUser = parts?.[0];

      // Get last message
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, created_at, is_read")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = msgs?.[0];
      const lastContent = lastMsg?.content || "";
      const readableLastMessage = isEncryptedContent(lastContent)
        ? await decryptMessageContent(lastContent, convId)
        : lastContent;

      // Count unread
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", convId)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      convos.push({
        id: convId,
        name: (otherUser as any)?.profiles?.display_name || "Utilisateur",
        avatar: (otherUser as any)?.profiles?.display_name?.[0] || "?",
        lastMessage: readableLastMessage || "Aucun message",
        time: lastMsg ? getTimeAgo(lastMsg.created_at) : "",
        unread: count || 0,
        online: false,
      });
    }

    setConversations(convos);
    setLoading(false);
  };

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "maintenant";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}j`;
  };

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Messages</h1>
        </div>

        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher une conversation..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm mb-2">Aucune conversation</p>
            <p className="text-xs text-muted-foreground">Suivez des utilisateurs mutuellement pour pouvoir leur écrire</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations
              .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(conv => (
                <motion.button
                  key={conv.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-card transition-colors w-full text-left"
                >
                  <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground">
                    {conv.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${conv.unread ? "text-foreground" : "text-foreground/80"}`}>{conv.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{conv.time}</span>
                    </div>
                    <p className={`text-xs truncate ${conv.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>{conv.lastMessage}</p>
                  </div>
                  {conv.unread > 0 && (
                    <div className="h-5 min-w-5 rounded-full gradient-primary flex items-center justify-center">
                      <span className="text-[10px] font-bold text-primary-foreground tabular-nums px-1">{conv.unread}</span>
                    </div>
                  )}
                </motion.button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
