import { Upload, Camera, Music, Sparkles, Scissors, Type } from "lucide-react";
import { motion } from "framer-motion";

const tools = [
  { icon: Camera, label: "Enregistrer", desc: "Utiliser la caméra" },
  { icon: Upload, label: "Importer", desc: "Depuis la galerie" },
  { icon: Music, label: "Sons", desc: "Ajouter de la musique" },
  { icon: Sparkles, label: "Effets", desc: "Filtres & AR" },
  { icon: Scissors, label: "Éditer", desc: "Couper & rogner" },
  { icon: Type, label: "Texte", desc: "Ajouter du texte" },
];

export default function CreatePage() {
  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[280px] flex items-center justify-center">
      <div className="mx-auto max-w-md px-4 text-center">
        {/* Big Upload Area */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="glass rounded-3xl p-12 mb-8 cursor-pointer border-dashed border-2 border-border/50"
        >
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center pulse-glow">
            <Upload className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Créer une vidéo</h2>
          <p className="text-sm text-muted-foreground">
            Importe ou enregistre une vidéo pour la partager avec le monde
          </p>
        </motion.div>

        {/* Tools Grid */}
        <div className="grid grid-cols-3 gap-3">
          {tools.map((tool) => (
            <motion.button
              key={tool.label}
              whileTap={{ scale: 0.93 }}
              className="glass rounded-2xl p-4 flex flex-col items-center gap-2"
            >
              <tool.icon className="h-6 w-6 text-primary" />
              <span className="text-xs font-semibold text-foreground">{tool.label}</span>
              <span className="text-[10px] text-muted-foreground">{tool.desc}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
