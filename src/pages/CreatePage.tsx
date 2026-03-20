import { useState, useRef, useEffect } from "react";
import { Upload, Camera, Music, Sparkles, Film, Type, Video, Mic, Palette, Wand2, X, Image } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("video");
  const [showLivePrep, setShowLivePrep] = useState(false);

  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 100MB)"); return; }
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      setCameraStream(stream);
      setShowCamera(true);
      setTimeout(() => {
        if (cameraRef.current) {
          cameraRef.current.srcObject = stream;
          cameraRef.current.play();
        }
      }, 100);
    } catch {
      toast.error("Autorise l'accès à la caméra dans les paramètres de ton navigateur");
    }
  };

  const takePhoto = () => {
    if (!cameraRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = cameraRef.current.videoWidth;
    canvas.height = cameraRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(cameraRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      closeCamera();
    }, "image/jpeg", 0.95);
  };

  const startRecording = () => {
    if (!cameraStream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(cameraStream, { mimeType: "video/webm;codecs=vp9" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `video_${Date.now()}.webm`, { type: "video/webm" });
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      closeCamera();
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const closeCamera = () => {
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setShowCamera(false);
    setIsRecording(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;
    setUploading(true);
    try {
      const ext = selectedFile.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, selectedFile);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const hashtagArray = hashtags.split(/[#,\s]+/).filter(Boolean).map(h => h.trim().toLowerCase());
      const { error: insertError } = await supabase.from("videos").insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        description: description.trim(),
        hashtags: hashtagArray,
        sound_name: "Son original",
        sound_artist: user.user_metadata?.username || "",
        comments_enabled: commentsEnabled,
        is_published: true,
      });
      if (insertError) throw insertError;
      toast.success("Publié ! 🎬");
      setSelectedFile(null);
      setPreview(null);
      setDescription("");
      setHashtags("");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la publication");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)] flex items-center justify-center">
      <div className="mx-auto max-w-md px-4 w-full">

        {/* Camera View */}
        <AnimatePresence>
          {showCamera && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background flex flex-col">
              <video ref={cameraRef} className="flex-1 w-full object-cover" muted playsInline autoPlay />
              <div className="absolute top-4 right-4 z-10">
                <motion.button whileTap={{ scale: 0.9 }} onClick={closeCamera} className="glass rounded-full p-2">
                  <X className="h-6 w-6 text-foreground" />
                </motion.button>
              </div>
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button onClick={() => setCameraMode("photo")} className={`px-3 py-1 rounded-full text-xs font-bold ${cameraMode === "photo" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>Photo</button>
                <button onClick={() => setCameraMode("video")} className={`px-3 py-1 rounded-full text-xs font-bold ${cameraMode === "video" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>Vidéo</button>
              </div>
              <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                {cameraMode === "photo" ? (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={takePhoto} className="h-20 w-20 rounded-full border-4 border-foreground bg-foreground/20" />
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`h-20 w-20 rounded-full border-4 ${isRecording ? "border-destructive bg-destructive/30" : "border-primary bg-primary/20"} flex items-center justify-center`}
                  >
                    {isRecording && <div className="h-8 w-8 rounded-md bg-destructive" />}
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!selectedFile ? (
          <div className="text-center">
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => fileInputRef.current?.click()}
              className="glass rounded-3xl p-10 mb-6 cursor-pointer border-dashed border-2 border-border/50 hover:border-primary/50 transition-colors"
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center pulse-glow">
                <Upload className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Importer un fichier</h2>
              <p className="text-sm text-muted-foreground">MP4, MOV, WebM, JPG, PNG, GIF — max 100MB</p>
            </motion.div>
            <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileSelect} />

            <div className="grid grid-cols-2 gap-3">
              <ToolButton icon={<Camera className="h-6 w-6" />} label="Caméra" desc="Photo & Vidéo" onClick={openCamera} />
              <ToolButton icon={<Video className="h-6 w-6" />} label="Live" desc="En direct" onClick={() => setShowLivePrep(true)} />
              <ToolButton icon={<Image className="h-6 w-6" />} label="Galerie" desc="Choisir un fichier" onClick={() => fileInputRef.current?.click()} />
              <ToolButton icon={<Palette className="h-6 w-6" />} label="Effets" desc="Filtres & AR" onClick={() => toast.info("Effets bientôt disponibles")} />
            </div>
          </div>
        ) : (
          <div>
            <div className="glass rounded-2xl p-4 mb-4">
              {selectedFile.type.startsWith("video") ? (
                <video src={preview!} className="w-full max-h-60 rounded-xl object-contain bg-background" controls />
              ) : (
                <img src={preview!} className="w-full max-h-60 rounded-xl object-contain" />
              )}
            </div>

            <div className="space-y-3 mb-4">
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ajoute une description... 📝" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" rows={3} />
              <input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#hashtags séparés par des espaces" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setCommentsEnabled(!commentsEnabled)}
                className="flex items-center gap-2 w-full glass rounded-xl px-4 py-3"
              >
                <MessageIcon enabled={commentsEnabled} />
                <span className="text-sm text-foreground">Commentaires {commentsEnabled ? "activés" : "désactivés"}</span>
              </motion.button>
            </div>

            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setSelectedFile(null); setPreview(null); }} className="flex-1 glass rounded-xl py-3 text-sm font-semibold text-foreground">Annuler</motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleUpload} disabled={uploading} className="flex-1 rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {uploading ? "Publication..." : "Publier 🚀"}
              </motion.button>
            </div>
          </div>
        )}

        {/* Live Prep Modal */}
        <AnimatePresence>
          {showLivePrep && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/90 flex items-center justify-center px-4" onClick={() => setShowLivePrep(false)}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass rounded-2xl p-6 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
                <Video className="h-12 w-12 text-primary mx-auto mb-3" />
                <h2 className="text-lg font-bold text-foreground mb-2">Passer en Live</h2>
                <p className="text-sm text-muted-foreground mb-4">Le système de live est en cours de développement. Bientôt tu pourras diffuser en direct et gagner de l'XP !</p>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowLivePrep(false)} className="rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground">
                  Compris 👍
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MessageIcon({ enabled }: { enabled: boolean }) {
  return enabled
    ? <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center"><span className="text-[10px] text-primary-foreground">✓</span></div>
    : <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center"><X className="h-3 w-3 text-muted-foreground" /></div>;
}

function ToolButton({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={onClick} className="glass rounded-2xl p-4 flex flex-col items-center gap-2">
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground">{desc}</span>
    </motion.button>
  );
}
