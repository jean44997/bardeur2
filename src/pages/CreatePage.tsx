import { useState, useRef } from "react";
import { Upload, Camera, Music, Sparkles, Film, Type } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["video/mp4", "video/mov", "video/avi", "video/quicktime", "video/webm", "image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.some(t => file.type.startsWith(t.split("/")[0]))) {
      toast.error("Format non supporté. Utilise MP4, MOV, JPG, PNG, GIF ou WEBP");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 100MB)");
      return;
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
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

      const hashtagArray = hashtags
        .split(/[#,\s]+/)
        .filter(Boolean)
        .map(h => h.trim().toLowerCase());

      const { error: insertError } = await supabase.from("videos").insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        description: description.trim(),
        hashtags: hashtagArray,
        sound_name: "Son original",
        sound_artist: user.user_metadata?.username || "",
      });

      if (insertError) throw insertError;

      toast.success("Vidéo publiée ! 🎬");
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
        {!selectedFile ? (
          <div className="text-center">
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => fileInputRef.current?.click()}
              className="glass rounded-3xl p-12 mb-6 cursor-pointer border-dashed border-2 border-border/50 hover:border-primary/50 transition-colors"
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center pulse-glow">
                <Upload className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Créer une vidéo</h2>
              <p className="text-sm text-muted-foreground">Importe une vidéo ou une photo (MP4, MOV, JPG, PNG, GIF)</p>
              <p className="text-xs text-muted-foreground mt-2">Max 100MB</p>
            </motion.div>

            <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileSelect} />

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Camera, label: "Caméra", desc: "Bientôt" },
                { icon: Music, label: "Sons", desc: "Bientôt" },
                { icon: Sparkles, label: "Effets", desc: "Bientôt" },
              ].map(tool => (
                <motion.button key={tool.label} whileTap={{ scale: 0.93 }} className="glass rounded-2xl p-4 flex flex-col items-center gap-2 opacity-50" onClick={() => toast.info(`${tool.label} bientôt disponible`)}>
                  <tool.icon className="h-6 w-6 text-primary" />
                  <span className="text-xs font-semibold text-foreground">{tool.label}</span>
                  <span className="text-[10px] text-muted-foreground">{tool.desc}</span>
                </motion.button>
              ))}
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
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ajoute une description... 📝"
                className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
                rows={3}
              />
              <input
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                placeholder="#hashtags séparés par des espaces"
                className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>

            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setSelectedFile(null); setPreview(null); }} className="flex-1 glass rounded-xl py-3 text-sm font-semibold text-foreground">
                Annuler
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {uploading ? "Publication..." : "Publier 🚀"}
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
