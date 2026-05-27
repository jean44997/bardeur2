export const flameRules = [
  "Une flamme monte seulement si les deux personnes repondent dans la meme journee.",
  "Un vocal compte comme relance forte et donne un bonus de proximite.",
  "Un partage direct de video ajoute des points si le destinataire repond.",
  "Un message copie-colle ne donne aucun bonus, meme avec beaucoup d'enthousiasme.",
  "Les points pubs sont limites par jour pour eviter les fermes de clics.",
  "Les flammes longues debloquent des badges, pas des paiements automatiques.",
  "Un signalement confirme met les recompenses en pause.",
  "Un blocage coupe la flamme sans penaliser l'autre personne.",
  "Les rewards live demandent chat sain, duree reelle et spectateurs non suspects.",
  "Le bonus cool du jour revient aux discussions rapides, propres et reciproques.",
];

export const flameRewardSteps = [
  { days: 2, label: "Etincelle", reward: "+5 XP chat" },
  { days: 5, label: "Duo chaud", reward: "+20 coins limites" },
  { days: 10, label: "Serie solide", reward: "badge relation" },
  { days: 20, label: "Super reels", reward: "boost local non payant" },
  { days: 30, label: "VIP flamme", reward: "theme chat exclusif" },
];
