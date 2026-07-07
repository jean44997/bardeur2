import { useState, useRef, useEffect } from "react";
import { Upload, Camera, Video, X, Image, Palette, Sparkles, Wand2, RotateCcw, Timer, Save, Hash, Gauge, Clock, Lock, Eye, Users, Download, MessageCircle, ShieldCheck, BadgeDollarSign, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { sanitizeHashtags, validateUploadFile, validateUserText } from "@/lib/contentSafety";
import { checkClientRateLimit, formatRetryAfter } from "@/lib/clientRateLimit";
import SeoHead from "@/components/SeoHead";

const creatorToolOptions = [
  { id: "autoCaptions", label: "Captions auto", icon: Sparkles },
  { id: "beautyPass", label: "Lumiere visage", icon: Wand2 },
  { id: "safeZone", label: "Zones iOS", icon: ShieldCheck },
  { id: "highBitrate", label: "Bitrate max", icon: Gauge },
  { id: "stabilize", label: "Stabiliser", icon: Video },
  { id: "coverPick", label: "Cover", icon: Image },
  { id: "soundMix", label: "Mix audio", icon: Palette },
  { id: "duet", label: "Duo", icon: Users },
  { id: "stitch", label: "Stitch", icon: Hash },
  { id: "downloads", label: "Download", icon: Download },
  { id: "comments", label: "Commentaires", icon: MessageCircle },
  { id: "brand", label: "Partenariat", icon: BadgeDollarSign },
  { id: "promote", label: "Promouvoir", icon: BadgeDollarSign },
  { id: "schedule", label: "Planifier", icon: Clock },
  { id: "privateStory", label: "Story privee", icon: Lock },
  { id: "publicStory", label: "Story publique", icon: Eye },
  { id: "location", label: "Lieu", icon: MapPin },
  { id: "antiSpam", label: "Anti-spam", icon: ShieldCheck },
  { id: "qualityGate", label: "Controle HD", icon: Gauge },
  { id: "draftBackup", label: "Backup draft", icon: Save },
];

export default function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const soundInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

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
  const [fileMeta, setFileMeta] = useState("");
  const [recordingDuration, setRecordingDuration] = useState<15 | 60 | 180 | 600>(15);
  const [recordingTime, setRecordingTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [scheduledAt, setScheduledAt] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [externalSoundName, setExternalSoundName] = useState("");
  const [editorLayers, setEditorLayers] = useState<string[]>([]);
  const [audioMix, setAudioMix] = useState(70);
  const [creatorOptions, setCreatorOptions] = useState<Record<string, boolean>>({
    autoCaptions: true,
    beautyPass: true,
    safeZone: true,
    highBitrate: true,
    stabilize: false,
    coverPick: true,
    soundMix: true,
    duet: true,
    stitch: true,
    downloads: true,
    comments: true,
    brand: false,
    promote: false,
    schedule: false,
    privateStory: false,
    publicStory: false,
    location: false,
    antiSpam: true,
    qualityGate: true,
    draftBackup: true,
  });

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
          if (z === 1) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
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

  useEffect(() => {
    const draft = localStorage.getItem("create-draft-meta");
    if (!draft) return;
    try {
      const parsed = JSON.parse(draft);
      setDescription(parsed.description || "");
      setHashtags(parsed.hashtags || "");
      setCommentsEnabled(parsed.commentsEnabled !== false);
      setEffect(parsed.effect || "none");
      setVisibility(parsed.visibility || "public");
      setScheduledAt(parsed.scheduledAt || "");
      setLocationTag(parsed.locationTag || "");
      setCoverNote(parsed.coverNote || "");
      setExternalSoundName(parsed.externalSoundName || "");
      setEditorLayers(Array.isArray(parsed.editorLayers) ? parsed.editorLayers : []);
      setAudioMix(Number(parsed.audioMix || 70));
      setCreatorOptions((prev) => ({ ...prev, ...(parsed.creatorOptions || {}) }));
    } catch {
      // Ignore corrupted local drafts and let the user start clean.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("create-draft-meta", JSON.stringify({ description, hashtags, commentsEnabled, effect, visibility, scheduledAt, locationTag, coverNote, externalSoundName, editorLayers, audioMix, creatorOptions }));
  }, [description, hashtags, commentsEnabled, effect, visibility, scheduledAt, locationTag, coverNote, externalSoundName, editorLayers, audioMix, creatorOptions]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!isRecording) {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      return;
    }
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingTime(t => {
        const next = t + 1;
        if (next >= recordingDuration) window.setTimeout(stopRecording, 0);
        return next;
      });
    }, 1000);
    return () => { if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current); };
  }, [isRecording, recordingDuration]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileCheck = validateUploadFile(file, { maxBytes: 2 * 1024 * 1024 * 1024, acceptedPrefixes: ["video/", "image/"] });
    if (!fileCheck.ok) { toast.error(fileCheck.reason); return; }
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setFileMeta(`${file.type || "fichier"} · ${(file.size / 1024 / 1024).toFixed(1)}MB · original conserve`);
  };

  const handleExternalSound = (file?: File | null) => {
    if (!file) return;
    const fileCheck = validateUploadFile(file, { maxBytes: 40 * 1024 * 1024, acceptedPrefixes: ["audio/"] });
    if (!fileCheck.ok) { toast.error(fileCheck.reason); return; }
    setExternalSoundName(file.name);
    setCreatorOptions(prev => ({ ...prev, soundMix: true }));
    toast.success("Son externe ajoute au mix");
  };

  const handleEditorLayer = (file?: File | null) => {
    if (!file) return;
    const fileCheck = validateUploadFile(file, { maxBytes: 150 * 1024 * 1024, acceptedPrefixes: ["image/", "video/"] });
    if (!fileCheck.ok) { toast.error(fileCheck.reason); return; }
    setEditorLayers(prev => [...prev, file.name].slice(0, 6));
    toast.success("Calque ajoute a la timeline");
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
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
      setFileMeta("image/jpeg · capture mobile");
      closeCamera();
    }, "image/jpeg", 0.95);
  };

  const startRecording = () => {
    if (!cameraStream) return;
    chunksRef.current = [];
    setRecordingTime(0);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const mr = new MediaRecorder(cameraStream, { mimeType, videoBitsPerSecond: 25_000_000, audioBitsPerSecond: 256_000 });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setSelectedFile(new File([blob], `video_${Date.now()}.webm`, { type: "video/webm" }));
      setPreview(URL.createObjectURL(blob));
      setFileMeta(`video/webm · ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
      setRecordingTime(0);
      closeCamera();
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  };

  const startCountdownThenRecord = () => {
    if (countdown > 0 || isRecording) return;
    setCountdown(3);
    let left = 3;
    const timer = window.setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        window.clearInterval(timer);
        startRecording();
      }
    }, 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
  };

  const flipCamera = async () => {
    const next = facingMode === "user" ? "environment" : "user";
    cameraStream?.getTracks().forEach(t => t.stop());
    setFacingMode(next);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 },
      });
      setCameraStream(stream);
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        cameraRef.current.play();
      }
    } catch {
      toast.error("Changement de caméra impossible");
    }
  };

  const autoHashtags = () => {
    const words = description
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 6);
    setHashtags(Array.from(new Set([...sanitizeHashtags(hashtags).map(h => `#${h}`), ...words.map(w => `#${w}`)])).slice(0, 8).join(" "));
  };

  const closeCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    setCameraStream(null);
    setShowCamera(false);
    setIsRecording(false);
    setRecordingTime(0);
    setCountdown(0);
  };

  const toggleCreatorOption = (id: string) => {
    setCreatorOptions(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (id === "comments") setCommentsEnabled(!prev[id]);
      if (id === "schedule" && prev[id]) setScheduledAt("");
      return next;
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;
    const postRate = checkClientRateLimit({ key: `post:${user.id}`, limit: 4, windowMs: 10 * 60_000, cooldownMs: 4000, blockMs: 5 * 60_000 });
    if (!postRate.allowed) {
      toast.error(`Publication ralentie, reessaie dans ${formatRetryAfter(postRate.retryAfterMs)}`);
      return;
    }
    const desc = validateUserText(description, { maxLength: 2200, minLength: 0, allowLinks: true });
    if (!desc.ok) { toast.error(desc.reason); return; }
    setUploading(true);
    try {
      const ext = selectedFile.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, selectedFile, { contentType: selectedFile.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const hashtagArray = sanitizeHashtags(hashtags);
      const videoPayload: any = {
        user_id: user.id,
        video_url: urlData.publicUrl,
        description: desc.value,
        hashtags: hashtagArray,
        sound_name: "Son original",
        sound_artist: user.user_metadata?.username || "",
        comments_enabled: commentsEnabled,
        is_published: !scheduledAt,
        audience: visibility,
        allow_downloads: creatorOptions.downloads !== false,
        allow_duet: creatorOptions.duet !== false,
        allow_stitch: creatorOptions.stitch !== false,
        auto_captions: creatorOptions.autoCaptions === true,
        promote_after_publish: creatorOptions.promote === true,
        brand_disclosure: creatorOptions.brand === true,
        location_tag: locationTag.trim() || null,
        cover_note: coverNote.trim() || null,
        scheduled_at: scheduledAt || null,
        create_options: creatorOptions,
        editor_metadata: {
          externalSoundName,
          editorLayers,
          audioMix,
          tracks: 1 + (externalSoundName ? 1 : 0),
          layers: editorLayers.length,
        },
      };
      let { error: insertError } = await (supabase as any).from("videos").insert(videoPayload);
      if (insertError && String(insertError.message || "").includes("editor_metadata")) {
        delete videoPayload.editor_metadata;
        const retry = await (supabase as any).from("videos").insert(videoPayload);
        insertError = retry.error;
      }
      if (insertError) throw insertError;
      toast.success("Publié ! 🎬");
      setSelectedFile(null);
      setPreview(null);
      setFileMeta("");
      setDescription("");
      setHashtags("");
      setScheduledAt("");
      setLocationTag("");
      setCoverNote("");
      setExternalSoundName("");
      setEditorLayers([]);
      setAudioMix(70);
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la publication");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)] flex items-center justify-center relative overflow-hidden">
      <SeoHead
        title="Publier une vidéo — BARDEUR YK"
        description="Enregistre ou importe ta vidéo courte, ajoute des effets, hashtags et publie sur BARDEUR YK en quelques secondes."
        path="/create"
      />
      {/* 3D Background Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-60" />

      <div className="mx-auto max-w-md px-4 w-full relative z-10">
        <h1 className="sr-only">Publier une nouvelle vidéo</h1>

        {/* Camera View */}
        <AnimatePresence>
          {showCamera && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background flex flex-col">
              <video ref={cameraRef} className={`flex-1 w-full object-cover ${effect === "pop" ? "saturate-150 contrast-125" : effect === "cinema" ? "contrast-125 brightness-90" : effect === "mono" ? "grayscale" : ""}`} muted playsInline autoPlay style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }} />
              {countdown > 0 && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-background/25">
                  <motion.span key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl font-black text-foreground drop-shadow-video">{countdown}</motion.span>
                </div>
              )}
              <div className="absolute top-4 right-4 z-10">
                <motion.button whileTap={{ scale: 0.9 }} onClick={closeCamera} className="glass rounded-full p-2">
                  <X className="h-6 w-6 text-foreground" />
                </motion.button>
              </div>
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button onClick={() => setCameraMode("photo")} className={`px-3 py-1 rounded-full text-xs font-bold ${cameraMode === "photo" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>Photo</button>
                <button onClick={() => setCameraMode("video")} className={`px-3 py-1 rounded-full text-xs font-bold ${cameraMode === "video" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>Vidéo</button>
              </div>
              <div className="absolute left-4 top-16 z-10 flex flex-col gap-2">
                {(["none", "pop", "cinema", "mono"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setEffect(f)} className={`glass rounded-full px-3 py-1 text-[11px] font-bold ${effect === f ? "text-primary" : "text-foreground"}`}>
                    {f === "none" ? "Normal" : f === "cinema" ? "Cine" : f === "mono" ? "N&B" : "Pop"}
                  </button>
                ))}
              </div>
              {cameraMode === "video" && (
                <div className="absolute bottom-32 left-0 right-0 z-10 flex justify-center gap-2">
                  {([15, 60, 180, 600] as const).map(d => (
                    <button key={d} type="button" onClick={() => setRecordingDuration(d)} className={`rounded-full px-3 py-1 text-xs font-bold ${recordingDuration === d ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                      {d === 600 ? "10m" : d === 180 ? "3m" : `${d}s`}
                    </button>
                  ))}
                </div>
              )}
              <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 items-center">
                <motion.button whileTap={{ scale: 0.9 }} onClick={flipCamera} className="glass rounded-full p-3">
                  <RotateCcw className="h-5 w-5 text-foreground" />
                </motion.button>
                {cameraMode === "photo" ? (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={takePhoto} className="h-20 w-20 rounded-full border-4 border-foreground bg-foreground/20" />
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={isRecording ? stopRecording : startCountdownThenRecord}
                    className={`h-20 w-20 rounded-full border-4 ${isRecording ? "border-destructive bg-destructive/30" : "border-primary bg-primary/20"} flex items-center justify-center`}
                  >
                    {isRecording ? <div className="h-8 w-8 rounded-md bg-destructive" /> : <Timer className="h-7 w-7 text-primary" />}
                  </motion.button>
                )}
                <div className="glass min-w-14 rounded-full px-3 py-2 text-center text-xs font-bold text-foreground tabular-nums">
                  {isRecording ? `${recordingTime}/${recordingDuration}s` : "HD"}
                </div>
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
              <p className="text-sm text-muted-foreground">MP4, MOV, WebM, JPG, PNG, GIF — 10 min / 4K original</p>
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
                <video src={preview!} className={`w-full max-h-[52svh] rounded-xl object-contain bg-background md:max-h-[60vh] ${effect === "pop" ? "saturate-150 contrast-125" : effect === "cinema" ? "contrast-125 brightness-90" : effect === "mono" ? "grayscale" : ""}`} controls preload="metadata" playsInline />
              ) : (
                <img src={preview!} className={`w-full max-h-[52svh] rounded-xl object-contain md:max-h-[60vh] ${effect === "pop" ? "saturate-150 contrast-125" : effect === "cinema" ? "contrast-125 brightness-90" : effect === "mono" ? "grayscale" : ""}`} alt="Aperçu" />
              )}
              {fileMeta && <p className="mt-3 text-center text-[11px] text-muted-foreground">{fileMeta}</p>}
            </div>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-4 gap-2">
                {(["none", "pop", "cinema", "mono"] as const).map(f => (
                  <button key={f} onClick={() => setEffect(f)} className={`rounded-xl px-2 py-2 text-xs font-semibold ${effect === f ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                    {f === "none" ? <Sparkles className="mx-auto h-4 w-4" /> : f === "pop" ? "Pop" : f === "cinema" ? "Ciné" : "N&B"}
                  </button>
                ))}
              </div>
              <div className="creator-editor-3d rounded-2xl border border-border/60 bg-card/72 p-3 shadow-xl">
                <input ref={soundInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleExternalSound(e.target.files?.[0])} />
                <input ref={layerInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleEditorLayer(e.target.files?.[0])} />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase text-foreground">Mini studio 3D</p>
                    <p className="text-[10px] text-muted-foreground">Audio multi-piste, calques et mix rapide</p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">{1 + (externalSoundName ? 1 : 0)} pistes</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => soundInputRef.current?.click()} className="rounded-xl bg-background/65 px-2 py-2 text-[10px] font-bold text-foreground">
                    <Palette className="mx-auto mb-1 h-4 w-4 text-primary" /> Son externe
                  </button>
                  <button type="button" onClick={() => layerInputRef.current?.click()} className="rounded-xl bg-background/65 px-2 py-2 text-[10px] font-bold text-foreground">
                    <Image className="mx-auto mb-1 h-4 w-4 text-primary" /> Calque
                  </button>
                  <button type="button" onClick={() => setEditorLayers([])} className="rounded-xl bg-background/65 px-2 py-2 text-[10px] font-bold text-foreground">
                    <RotateCcw className="mx-auto mb-1 h-4 w-4 text-primary" /> Reset
                  </button>
                </div>
                <div className="mt-3 rounded-xl bg-background/55 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                    <span>Mix audio</span>
                    <span>{audioMix}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={audioMix} onChange={(e) => setAudioMix(Number(e.target.value))} className="w-full accent-primary" />
                </div>
                {(externalSoundName || editorLayers.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {externalSoundName && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{externalSoundName}</span>}
                    {editorLayers.map((layer, idx) => (
                      <span key={`${layer}-${idx}`} className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-foreground">{idx + 1}. {layer}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ajoute une description... 📝" maxLength={2200} className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" rows={3} />
                <p className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">{description.length}/2200</p>
              </div>
              <input value={hashtags} onChange={e => setHashtags(e.target.value)} maxLength={160} placeholder="#hashtags séparés par des espaces" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <div className="grid grid-cols-3 gap-2">
                {(["public", "followers", "private"] as const).map(option => (
                  <button key={option} type="button" onClick={() => setVisibility(option)} className={`rounded-xl px-3 py-2 text-xs font-bold ${visibility === option ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                    {option === "public" ? "Public" : option === "followers" ? "Abonnes" : "Prive"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={locationTag} onChange={e => setLocationTag(e.target.value)} maxLength={80} placeholder="Lieu / evenement" className="glass rounded-xl px-3 py-2 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none" />
                <input value={coverNote} onChange={e => setCoverNote(e.target.value)} maxLength={80} placeholder="Note cover" className="glass rounded-xl px-3 py-2 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none" />
              </div>
              {creatorOptions.schedule && (
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground outline-none" />
              )}
              <div className="grid grid-cols-4 gap-2">
                {creatorToolOptions.map(tool => (
                  <button key={tool.id} type="button" onClick={() => toggleCreatorOption(tool.id)} className={`min-h-16 rounded-xl px-2 py-2 text-[10px] font-bold ${creatorOptions[tool.id] ? "bg-primary/15 text-primary" : "glass text-muted-foreground"}`}>
                    <tool.icon className="mx-auto mb-1 h-4 w-4" />
                    <span className="block leading-tight">{tool.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={autoHashtags} className="glass flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-foreground">
                  <Hash className="h-3.5 w-3.5 text-primary" /> Auto
                </button>
                <button type="button" onClick={() => toast.success("Brouillon sauvegardé")} className="glass flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-foreground">
                  <Save className="h-3.5 w-3.5 text-primary" /> Draft
                </button>
                <button type="button" onClick={() => setEffect(effect === "pop" ? "cinema" : effect === "cinema" ? "mono" : effect === "mono" ? "none" : "pop")} className="glass flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-foreground">
                  <Wand2 className="h-3.5 w-3.5 text-primary" /> Effet
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-card/60 p-2">
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> HD</div>
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground"><Timer className="h-3.5 w-3.5" /> {recordingDuration === 600 ? "10m" : recordingDuration === 180 ? "3m" : `${recordingDuration}s`}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> {effect === "none" ? "Normal" : effect}</div>
              </div>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setCommentsEnabled(!commentsEnabled); setCreatorOptions(prev => ({ ...prev, comments: !commentsEnabled })); }} className="flex items-center gap-2 w-full glass rounded-xl px-4 py-3">
                <div className={`h-5 w-5 rounded-full flex items-center justify-center ${commentsEnabled ? "bg-primary" : "bg-muted"}`}>
                  {commentsEnabled ? <span className="text-[10px] text-primary-foreground">✓</span> : <X className="h-3 w-3 text-muted-foreground" />}
                </div>
                <span className="text-sm text-foreground">Commentaires {commentsEnabled ? "activés" : "désactivés"}</span>
              </motion.button>
            </div>
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setSelectedFile(null); setPreview(null); setFileMeta(""); }} className="flex-1 glass rounded-xl py-3 text-sm font-semibold text-foreground">Annuler</motion.button>
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
