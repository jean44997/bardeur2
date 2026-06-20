import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, BellRing } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface IncomingCallNotice {
  id: string;
  conversationId: string;
  callerId: string;
  callType: "audio" | "video";
  callerName: string;
}

type DirectCallSession = Tables<"direct_call_sessions">;
type MessageNotification = Tables<"notifications">;
type CallerProfile = Pick<Tables<"profiles">, "username" | "display_name" | "avatar_url">;
type WindowWithWebkitAudio = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export default function GlobalCallListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCallNotice | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const incomingIdRef = useRef<string | null>(null);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  const stopRing = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const startRing = useCallback(() => {
    stopRing();
    const AudioCtx = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    ctx.resume?.().catch(() => {});
    const beep = () => {
      if (ctx.state === "suspended") void ctx.resume?.();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    };
    beep();
    timerRef.current = window.setInterval(beep, 950);
  }, [stopRing]);

  useEffect(() => {
    incomingIdRef.current = incoming?.id || null;
  }, [incoming?.id]);

  useEffect(() => {
    const unlockAudio = () => {
      audioCtxRef.current?.resume?.().catch(() => {});
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setIncoming(null);
      stopRing();
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const notifyIncomingCall = async (call: DirectCallSession, callerName: string, icon?: string | null) => {
      if (!call?.id || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (notifiedIdsRef.current.has(call.id)) return;
      notifiedIdsRef.current.add(call.id);
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const title = call.call_type === "video" ? "Appel video entrant" : "Appel audio entrant";
        const opts: NotificationOptions = {
          body: `${callerName} t'appelle`,
          icon: icon || "/app-icon-512.png",
          badge: "/app-icon-512.png",
          tag: `call-${call.id}`,
          renotify: true,
          requireInteraction: true,
          data: { url: `/chat/${call.conversation_id}?call=${call.id}&answer=1` },
        };
        if (reg?.showNotification) await reg.showNotification(title, opts);
        else {
          const note = new Notification(title, opts);
          note.onclick = () => {
            window.focus();
            navigate(`/chat/${call.conversation_id}?call=${call.id}&answer=1`);
            note.close();
          };
        }
      } catch {
        // The in-app modal and vibration still warn the user.
      }
    };

    const showIncomingCall = async (call: DirectCallSession | null) => {
      if (!call || call.status !== "ringing" || call.caller_id === user.id) return;
      if (incomingIdRef.current === call.id) return;
      const { data: caller } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("id", call.caller_id).maybeSingle();
      const profile = caller as CallerProfile | null;
      const callerName = profile?.display_name || profile?.username || "Utilisateur";
      setIncoming({
        id: call.id,
        conversationId: call.conversation_id,
        callerId: call.caller_id,
        callType: call.call_type === "video" ? "video" : "audio",
        callerName,
      });
      startRing();
      navigator.vibrate?.([220, 90, 220, 90, 220, 90, 220]);
      void notifyIncomingCall(call, callerName, profile?.avatar_url);
    };

    const channel = supabase
      .channel(`global-calls-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_call_sessions", filter: `recipient_id=eq.${user.id}` }, (payload) => {
        void showIncomingCall(payload.new as DirectCallSession);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const notification = payload.new as MessageNotification;
        if (!notification?.reference_id || !String(notification?.content || "").toLowerCase().includes("appel")) return;
        const { data: call } = await supabase
          .from("direct_call_sessions")
          .select("*")
          .eq("conversation_id", notification.reference_id)
          .eq("recipient_id", user.id)
          .eq("status", "ringing")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (call) await showIncomingCall(call);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_call_sessions", filter: `recipient_id=eq.${user.id}` }, (payload) => {
        const call = payload.new as DirectCallSession;
        if (incomingIdRef.current === call?.id && call.status !== "ringing") {
          setIncoming(null);
          stopRing();
        }
      })
      .subscribe();

    const fallbackTimer = window.setInterval(async () => {
      if (incomingIdRef.current) return;
      const { data: call } = await supabase
        .from("direct_call_sessions")
        .select("*")
        .eq("recipient_id", user.id)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (call) await showIncomingCall(call);
    }, 4500);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(fallbackTimer);
      stopRing();
    };
  }, [navigate, startRing, stopRing, user]);

  const accept = () => {
    if (!incoming) return;
    stopRing();
    const call = incoming;
    setIncoming(null);
    navigate(`/chat/${call.conversationId}?call=${call.id}&answer=1`);
  };

  const decline = async () => {
    if (!incoming) return;
    const callId = incoming.id;
    setIncoming(null);
    stopRing();
    await supabase.from("direct_call_sessions").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", callId);
    toast.info("Appel refuse");
  };

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-background/88 px-4 backdrop-blur-xl"
        >
          <motion.div initial={{ scale: 0.94, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 18 }} className="w-full max-w-xs rounded-3xl border border-border bg-card p-5 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full gradient-primary text-2xl font-black text-primary-foreground">
              {incoming.callType === "video" ? <Video className="h-8 w-8" /> : <BellRing className="h-8 w-8" />}
            </div>
            <p className="text-lg font-bold text-foreground">{incoming.callerName}</p>
            <p className="mt-1 text-xs font-semibold text-primary">{incoming.callType === "video" ? "Appel video entrant" : "Appel audio entrant"}</p>
            <div className="mt-5 flex items-center justify-center gap-5">
              <button type="button" onClick={decline} className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground" aria-label="Refuser l'appel">
                <PhoneOff className="h-6 w-6" />
              </button>
              <button type="button" onClick={accept} className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Decrocher">
                <Phone className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-4 text-[11px] font-medium text-muted-foreground">Sonnerie, vibration et notification sont lancees ensemble.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
