import { useState, useRef, useEffect } from "react";
import { Upload, Camera, Video, X, Image, Palette, Sparkles, Wand2 } from "lucide-react";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const [effect, setEffect] = useState<"none" | "pop" | "cinema" | "mono">("none");

  // 3D Canvas background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    let time = 0;

    const resize = () => { canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      time += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2, cy = canvas.height / 2;

      // Perspective grid
      ctx.strokeStyle = "hsla(330,100%,60%,0.04)";
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        for (let z = 1; z < 15; z++) {
          const s = 400 / (400 + z * 50);
          const sx = cx + i * 50 * s;
          const sy = cy + (z * 50 - 200) * s * 0.5;
          z === 1 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Orbiting rings
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        const rad = 80 + r * 50;
        const ox = Math.sin(time + r) * 25;
        const oy = Math.cos(time * 0.7 + r) * 15;
        ctx.ellipse(cx + ox, cy * 0.5 + oy, rad, rad * 0.3, time + r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${330 + r * 40},100%,60%,${0.06 - r * 0.015})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  useEffect(() => {
    return () => { if (cameraStream) cameraStream.getTracks().forEach(t => t.stop()); };
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
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 },
      });
      setCameraStream(stream);
      setShowCamera(true);
      setTimeout(() => {
        if (cameraRef.current) { cameraRef.current.srcObject = stream; cameraRef.current.play(); }
      }, 100);
    } catch {
      toast.error("Autorise l'accès à la caméra dans les paramètres de ton navigateur");
    }
  };

  const takePhoto = () => {
    if (!cameraRef.current) return;
    const c = document.createElement("canvas");
    c.width = cameraRef.current.videoWidth;
    c.height = cameraRef.current.videoHeight;
    c.getContext("2d")?.drawImage(cameraRef.current, 0, 0);
    c.toBlob((blob) => {
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
      const mr = new MediaRecorder(cameraStream, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setSelectedFile(new File([blob], `video_${Date.now()}.webm`, { type: "video/webm" }));
      setPreview(URL.createObjectURL(blob));
      closeCamera();
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); };

  const closeCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
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
      const { error: uploadError } = await supabase.storage.from("media").upload(path, selectedFile, { contentType: selectedFile.type });
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
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)] flex items-center justify-center relative overflow-hidden">
      {/* 3D Background Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-60" />

      <div className="mx-auto max-w-md px-4 w-full relative z-10">

        {/* Camera View */}
        <AnimatePresence>
          {showCamera && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background flex flex-col">
              <video ref={cameraRef} className="flex-1 w-full object-cover" muted playsInline autoPlay style={{ transform: "scaleX(-1)" }} />
              <div className="absolute top-4 right-4 z-10">
                <motion.button whileTap={{ scale: 0.9 }} onClick={closeCamera} className="glass rounded-full p-2">
                  <X className="h-6 w-6 text-foreground" />
                </motion.button>
              </div>
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button onClick={() => setCameraMode("photo")} className={`px-3 py-1 rounded-full text-xs font-bold ${cameraMode === "photo" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>Photo</button>
                <button onClick={() => setCameraMode("video")} className={`px-3 py-1 rounded-full text-xs font-bold ${cameraMode === "video" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>Vidéo</button>
              </div>
              <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 items-center">
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
              <motion.button whileTap={{ scale: 0.93 }} onClick={openCamera} className="glass rounded-2xl p-4 flex flex-col items-center gap-2">
                <span className="text-primary"><Camera className="h-6 w-6" /></span>
                <span className="text-xs font-semibold text-foreground">Caméra</span>
                <span className="text-[10px] text-muted-foreground">Photo & Vidéo</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => navigate("/live")} className="glass rounded-2xl p-4 flex flex-col items-center gap-2">
                <span className="text-primary"><Video className="h-6 w-6" /></span>
                <span className="text-xs font-semibold text-foreground">Live</span>
                <span className="text-[10px] text-muted-foreground">En direct</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => fileInputRef.current?.click()} className="glass rounded-2xl p-4 flex flex-col items-center gap-2">
                <span className="text-primary"><Image className="h-6 w-6" /></span>
                <span className="text-xs font-semibold text-foreground">Galerie</span>
                <span className="text-[10px] text-muted-foreground">Choisir un fichier</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setEffect(effect === "pop" ? "cinema" : effect === "cinema" ? "mono" : "pop")} className="glass rounded-2xl p-4 flex flex-col items-center gap-2">
                <span className="text-primary"><Palette className="h-6 w-6" /></span>
                <span className="text-xs font-semibold text-foreground">Effets</span>
                <span className="text-[10px] text-muted-foreground">{effect === "none" ? "Filtres" : effect}</span>
              </motion.button>
            </div>
          </div>
        ) : (
          <div>
            <div className="glass rounded-2xl p-4 mb-4">
              {selectedFile.type.startsWith("video") ? (
                <video src={preview!} className={`w-full max-h-60 rounded-xl object-contain bg-background ${effect === "pop" ? "saturate-150 contrast-125" : effect === "cinema" ? "contrast-125 brightness-90" : effect === "mono" ? "grayscale" : ""}`} controls />
              ) : (
                <img src={preview!} className={`w-full max-h-60 rounded-xl object-contain ${effect === "pop" ? "saturate-150 contrast-125" : effect === "cinema" ? "contrast-125 brightness-90" : effect === "mono" ? "grayscale" : ""}`} alt="Aperçu" />
              )}
            </div>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-4 gap-2">
                {(["none", "pop", "cinema", "mono"] as const).map(f => (
                  <button key={f} onClick={() => setEffect(f)} className={`rounded-xl px-2 py-2 text-xs font-semibold ${effect === f ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                    {f === "none" ? <Sparkles className="mx-auto h-4 w-4" /> : f === "pop" ? "Pop" : f === "cinema" ? "Ciné" : "N&B"}
                  </button>
                ))}
              </div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ajoute une description... 📝" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" rows={3} />
              <input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#hashtags séparés par des espaces" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCommentsEnabled(!commentsEnabled)} className="flex items-center gap-2 w-full glass rounded-xl px-4 py-3">
                <div className={`h-5 w-5 rounded-full flex items-center justify-center ${commentsEnabled ? "bg-primary" : "bg-muted"}`}>
                  {commentsEnabled ? <span className="text-[10px] text-primary-foreground">✓</span> : <X className="h-3 w-3 text-muted-foreground" />}
                </div>
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
      </div>
    </div>
  );
}
