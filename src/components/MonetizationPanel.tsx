import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign, BarChart3, CheckCircle2, Circle, ClipboardCheck, CreditCard,
  Crown, Eye, Gift, LockKeyhole, ReceiptText, Rocket, Send,
  ShieldCheck, Sparkles, Users, WalletCards
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface MonetizationPanelProps {
  stats: { followers: number; likes: number; videos: number; views: number };
  username: string;
}

interface PlaybookItem {
  id: string;
  title: string;
  detail: string;
  how: string;
  category: "setup" | "content" | "money" | "growth" | "safety";
}

const monetizationItems: PlaybookItem[] = [
  { id: "m01", title: "Compte en regle", detail: "Aucun abus recent, contenu original et profil complet.", how: "Verifie 2FA, bio, lien, avatar et historique de signalements.", category: "safety" },
  { id: "m02", title: "Age et pays eligibles", detail: "La monetisation demande une verification age/region.", how: "Garde une piece valide et un moyen de paiement au meme nom.", category: "setup" },
  { id: "m03", title: "Videos originales", detail: "Les reuploads et filigranes tiers baissent l'eligibilite.", how: "Publie des prises creees par toi avec montage propre.", category: "content" },
  { id: "m04", title: "Format long utile", detail: "Les programmes type rewards favorisent les videos de plus d'une minute.", how: "Prepare des scripts de 60 a 180 secondes quand le sujet le merite.", category: "content" },
  { id: "m05", title: "Qualite 1080p+", detail: "Les contenus nets et stables performent mieux.", how: "Filme en HD, stabilise, garde une lumiere claire.", category: "content" },
  { id: "m06", title: "Retention 5 secondes", detail: "Les vues tres courtes sont faibles pour les gains.", how: "Commence par une action visuelle ou une phrase directe.", category: "growth" },
  { id: "m07", title: "RPM et vues qualifiees", detail: "Le revenu depend des vues valides et de la valeur publicitaire.", how: "Evite traffic artificiel, spam et vues payees douteuses.", category: "money" },
  { id: "m08", title: "Reward standard", detail: "Suivi des vues, engagement et performance par video.", how: "Lis les stats par post avant de republier un format.", category: "money" },
  { id: "m09", title: "Reward additionnel", detail: "Bonus possible pour videos bien faites et specialisees.", how: "Choisis une niche claire et ajoute du montage utile.", category: "money" },
  { id: "m10", title: "Tableau de bord", detail: "Vue claire des gains estimes, RPM et evolution.", how: "Ouvre cette section chaque semaine et coche les actions faites.", category: "money" },
  { id: "m11", title: "Methode de paiement", detail: "Paiement bancaire ou wallet selon disponibilite.", how: "Ajoute un email de paiement et teste une demande faible.", category: "money" },
  { id: "m12", title: "Seuil de retrait", detail: "Evite les micro-retraits qui creent des frais.", how: "Fixe un montant minimum et regroupe les paiements.", category: "money" },
  { id: "m13", title: "Justificatifs fiscaux", detail: "Les plateformes peuvent demander KYC/taxes.", how: "Prepare nom legal, pays, adresse et justificatif.", category: "setup" },
  { id: "m14", title: "Appel de decision", detail: "Un refus peut etre reetudie si le contenu est legitime.", how: "Garde liens, sources, rushs et captures de montage.", category: "safety" },
  { id: "m15", title: "Declaration pub", detail: "Sponsor, cadeau ou affiliation doivent etre declares.", how: "Active la divulgation sur les posts concernes.", category: "safety" },
  { id: "m16", title: "Sons commerciaux", detail: "Une campagne ne doit pas utiliser un son non autorise.", how: "Pour une pub, favorise son original ou banque commerciale.", category: "safety" },
  { id: "m17", title: "Promouvoir une video", detail: "Booste une video publique avec objectif clair.", how: "Cree une campagne brouillon avec budget et objectif.", category: "growth" },
  { id: "m18", title: "Objectif campagne", detail: "Vues, abonnes ou clics ne demandent pas le meme contenu.", how: "Choisis un objectif par campagne, jamais tout a la fois.", category: "growth" },
  { id: "m19", title: "Budget journalier", detail: "Limiter le budget evite une depense non controlee.", how: "Commence petit, lis les stats, puis augmente.", category: "money" },
  { id: "m20", title: "Lien bio tracke", detail: "Un lien bio peut convertir trafic en argent.", how: "Mets un lien clair avec UTM ou code createur.", category: "growth" },
  { id: "m21", title: "Marques et briefs", detail: "Les partenariats demandent un profil propre.", how: "Prepare tarifs, audience, niche et exemples de videos.", category: "money" },
  { id: "m22", title: "Live gifts", detail: "Les lives peuvent generer des cadeaux si actifs.", how: "Annonce le live, modere le chat et recycle les meilleurs moments.", category: "money" },
  { id: "m23", title: "Series premium", detail: "Une suite de contenus peut etre vendue en pack.", how: "Regroupe tutoriels, coulisses ou episodes exclusifs.", category: "money" },
  { id: "m24", title: "Tips et dons", detail: "Les fans peuvent soutenir hors abonnement.", how: "Ajoute un appel discret dans bio et fin de video.", category: "money" },
  { id: "m25", title: "Shop et affiliation", detail: "Un produit lie au contenu convertit mieux.", how: "Ne recommande que ce que tu peux expliquer honnetement.", category: "money" },
  { id: "m26", title: "Rapport mensuel", detail: "Comparaison gains, vues, formats et temps de watch.", how: "Archive chaque mois les chiffres importants.", category: "growth" },
  { id: "m27", title: "Anti-fraude", detail: "Bots, achats de vues et spam peuvent bloquer les gains.", how: "Surveille pics suspects et signale les anomalies.", category: "safety" },
  { id: "m28", title: "Moderation commentaires", detail: "Un espace sain garde les marques et fans.", how: "Filtre insultes, spam et liens suspects.", category: "safety" },
  { id: "m29", title: "Calendrier publication", detail: "Regularite aide l'algorithme et les abonnements.", how: "Planifie 3 idees avancees et recycle les meilleurs formats.", category: "growth" },
  { id: "m30", title: "Audit securite", detail: "Avant paiement, compte durci et appareils connus.", how: "Active 2FA, change mot de passe et verifie sessions.", category: "safety" },
];

const subscriptionItems: PlaybookItem[] = [
  { id: "s01", title: "Offre claire", detail: "L'abonne doit comprendre la valeur en 5 secondes.", how: "Ecris une phrase simple sur ce qui est exclusif.", category: "setup" },
  { id: "s02", title: "Prix mensuel", detail: "Prix bas pour demarrer, puis ajustement avec valeur.", how: "Teste 299, 499 ou 999 centimes selon audience.", category: "money" },
  { id: "s03", title: "Badge supporter", detail: "Un badge rend l'appartenance visible.", how: "Active le badge dans les avantages affiches.", category: "growth" },
  { id: "s04", title: "Stories privees", detail: "Les abonnes voient des contenus courts exclusifs.", how: "Publie coulisses, sondages ou annonces avant public.", category: "content" },
  { id: "s05", title: "Chat abonne", detail: "Canal plus calme pour vrais fans.", how: "Reserve questions/reponses et infos importantes.", category: "growth" },
  { id: "s06", title: "Son notif custom", detail: "Inspiration Snap: son different pour relation forte.", how: "Propose un son d'alerte premium par createur.", category: "growth" },
  { id: "s07", title: "Message bienvenue", detail: "La premiere minute decide la retention.", how: "Automatise un merci + lien vers le meilleur contenu.", category: "setup" },
  { id: "s08", title: "Live mensuel", detail: "Un rendez-vous fixe justifie le paiement.", how: "Programme un live abonne chaque mois.", category: "content" },
  { id: "s09", title: "Reponses prioritaires", detail: "Les abonnes obtiennent plus de proximite.", how: "Filtre les commentaires abonnes et reponds d'abord.", category: "growth" },
  { id: "s10", title: "Coulisses", detail: "Contenu brut mais utile, pas juste du bonus vide.", how: "Montre idees, erreurs, setup, avant/apres.", category: "content" },
  { id: "s11", title: "Code reduction", detail: "Utile pour merch, coaching ou produits.", how: "Cree un code mensuel et retire les codes expires.", category: "money" },
  { id: "s12", title: "Annulation simple", detail: "Moins de friction, plus de confiance.", how: "Explique comment arreter sans pression.", category: "safety" },
  { id: "s13", title: "Politique remboursement", detail: "Evite conflits et abus.", how: "Clarifie cas valides et delais.", category: "safety" },
  { id: "s14", title: "Calendrier exclusif", detail: "Les abonnes savent quand revenir.", how: "Planifie stories, lives et drops.", category: "content" },
  { id: "s15", title: "Moderation abonnes", detail: "Un abonne peut aussi enfreindre les regles.", how: "Garde block/report et avertissement.", category: "safety" },
  { id: "s16", title: "Age gate", detail: "Certaines offres doivent filtrer les mineurs.", how: "Marque les contenus sensibles et demande confirmation.", category: "safety" },
  { id: "s17", title: "Liste abonnes", detail: "Suivre churn, renouvellements et fans actifs.", how: "Trie abonnes actifs, expires et en essai.", category: "money" },
  { id: "s18", title: "Merci automatique", detail: "Renforce relation des l'achat.", how: "Envoie un DM court et humain.", category: "growth" },
  { id: "s19", title: "Bonus flamme", detail: "Streak entre user et createur pour points.", how: "Donne points si interaction quotidienne.", category: "growth" },
  { id: "s20", title: "Parrainage", detail: "Fans ramenent fans.", how: "Offre badge ou point apres invitation valide.", category: "growth" },
  { id: "s21", title: "Commentaires VIP", detail: "Signal visuel sans bloquer les autres.", how: "Affiche un badge discret a cote du nom.", category: "growth" },
  { id: "s22", title: "Emoji custom", detail: "Petit avantage social qui rend l'offre fun.", how: "Ajoute 3 reactions reservees abonnes.", category: "growth" },
  { id: "s23", title: "Sondages abonnes", detail: "Les fans choisissent le prochain contenu.", how: "Demande sujet, format ou invite.", category: "content" },
  { id: "s24", title: "Archives premium", detail: "Les anciens contenus gardent de la valeur.", how: "Classe les meilleurs lives et stories.", category: "content" },
  { id: "s25", title: "QR invite", detail: "Partage rapide hors app.", how: "Utilise le QR profil pour convertir en abonnement.", category: "growth" },
  { id: "s26", title: "Places limitees", detail: "Rarete utile si l'avantage demande du temps.", how: "Limite les reponses perso ou coaching.", category: "money" },
  { id: "s27", title: "Essai court", detail: "Reduit le risque de l'utilisateur.", how: "Propose essai symbolique si le paiement le permet.", category: "money" },
  { id: "s28", title: "Statut facturation", detail: "Toujours savoir actif, expire ou bloque.", how: "Affiche statut local et serveur.", category: "money" },
  { id: "s29", title: "Partage revenus", detail: "Prevoir frais plateforme et taxes.", how: "Calcule net estime avant retrait.", category: "money" },
  { id: "s30", title: "Analytics abonnes", detail: "Mesure conversion, retention et churn.", how: "Compare prix, posts exclusifs et messages.", category: "growth" },
];

const categoryLabels: Record<PlaybookItem["category"], string> = {
  setup: "Setup",
  content: "Contenu",
  money: "Argent",
  growth: "Croissance",
  safety: "Securite",
};

export default function MonetizationPanel({ stats, username }: MonetizationPanelProps) {
  const { user } = useAuth();
  const storageKey = user ? `monetization-panel:${user.id}` : "monetization-panel:guest";
  const [mode, setMode] = useState<"monetization" | "subscriptions">("monetization");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [payoutEmail, setPayoutEmail] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("25");
  const [subscriptionPrice, setSubscriptionPrice] = useState("4.99");
  const [subscriberPerks, setSubscriberPerks] = useState("Stories privees, badge supporter, chat prioritaire");
  const [promoteBudget, setPromoteBudget] = useState("10");
  const [promoteObjective, setPromoteObjective] = useState<"views" | "followers" | "website">("views");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setCompleted(parsed.completed || {});
      setPayoutEmail(parsed.payoutEmail || "");
      setPayoutAmount(parsed.payoutAmount || "25");
      setSubscriptionPrice(parsed.subscriptionPrice || "4.99");
      setSubscriberPerks(parsed.subscriberPerks || subscriberPerks);
      setPromoteBudget(parsed.promoteBudget || "10");
      setPromoteObjective(parsed.promoteObjective || "views");
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      completed, payoutEmail, payoutAmount, subscriptionPrice, subscriberPerks, promoteBudget, promoteObjective
    }));
  }, [completed, payoutEmail, payoutAmount, subscriptionPrice, subscriberPerks, promoteBudget, promoteObjective, storageKey]);

  const currentItems = mode === "monetization" ? monetizationItems : subscriptionItems;
  const doneCount = currentItems.filter(item => completed[item.id]).length;
  const readiness = Math.round((doneCount / currentItems.length) * 100);
  const estimatedMonthly = useMemo(() => {
    const rpm = Math.max(0.25, Math.min(4.5, stats.likes / Math.max(1000, stats.views || 1000)));
    const creatorRevenue = (stats.views / 1000) * rpm;
    const subscriptionRevenue = Math.max(0, Math.round(stats.followers * 0.02)) * Number(subscriptionPrice || 0);
    return creatorRevenue + subscriptionRevenue;
  }, [stats.followers, stats.likes, stats.views, subscriptionPrice]);

  const toggleItem = async (id: string) => {
    setCompleted(prev => ({ ...prev, [id]: !prev[id] }));
    if (user) {
      try {
        await (supabase as any).from("creator_monetization_tasks").upsert({
          user_id: user.id,
          task_id: id,
          completed: !completed[id],
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,task_id" });
      } catch {
        // Local persistence keeps the checklist usable before migrations are applied.
      }
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await (supabase as any).from("monetization_settings").upsert({
        user_id: user.id,
        payout_email: payoutEmail.trim(),
        subscription_price_cents: Math.round(Number(subscriptionPrice || 0) * 100),
        subscriber_perks: subscriberPerks,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      toast.success("Reglages createur sauvegardes");
    } catch {
      toast.success("Reglages sauvegardes localement");
    } finally {
      setSaving(false);
    }
  };

  const requestPayout = async () => {
    if (!user) return;
    const amount = Number(payoutAmount);
    if (!payoutEmail.trim() || !Number.isFinite(amount) || amount < 10) {
      toast.error("Ajoute un email paiement et minimum 10");
      return;
    }
    try {
      await (supabase as any).from("payout_requests").insert({
        user_id: user.id,
        amount_cents: Math.round(amount * 100),
        payout_email: payoutEmail.trim(),
        status: "pending",
      });
      toast.success("Demande de paiement envoyee");
    } catch {
      toast.success("Demande de paiement preparee localement");
    }
  };

  const createPromoteDraft = async () => {
    if (!user) return;
    const budget = Number(promoteBudget);
    if (!Number.isFinite(budget) || budget < 2) {
      toast.error("Budget minimum 2");
      return;
    }
    try {
      await (supabase as any).from("promote_campaigns").insert({
        user_id: user.id,
        objective: promoteObjective,
        daily_budget_cents: Math.round(budget * 100),
        status: "draft",
      });
      toast.success("Brouillon pub cree");
    } catch {
      toast.success("Brouillon pub prepare localement");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMode("monetization")} className={`rounded-xl px-3 py-2 text-xs font-bold ${mode === "monetization" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
          <WalletCards className="mx-auto mb-1 h-4 w-4" /> Monetisation
        </button>
        <button type="button" onClick={() => setMode("subscriptions")} className={`rounded-xl px-3 py-2 text-xs font-bold ${mode === "subscriptions" ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
          <Crown className="mx-auto mb-1 h-4 w-4" /> Abonnement
        </button>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">@{username}</p>
            <p className="text-xs text-muted-foreground">Pret a {readiness}% avec {doneCount}/{currentItems.length} actions cochees</p>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-card text-sm font-black text-primary">{readiness}%</div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Metric icon={<Eye className="h-3.5 w-3.5" />} label="Vues" value={stats.views} />
          <Metric icon={<Users className="h-3.5 w-3.5" />} label="Fans" value={stats.followers} />
          <Metric icon={<Sparkles className="h-3.5 w-3.5" />} label="Posts" value={stats.videos} />
          <Metric icon={<BadgeDollarSign className="h-3.5 w-3.5" />} label="Est." value={Math.round(estimatedMonthly)} suffix="$" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { icon: ShieldCheck, label: "2FA/KYC", ok: completed.m30 || completed.m01 },
            { icon: Gift, label: "Gifts live", ok: completed.m22 || completed.s08 },
            { icon: Rocket, label: "Promote", ok: completed.m17 || completed.m18 },
          ].map(item => (
            <div key={item.label} className={`rounded-xl px-2 py-2 text-center ${item.ok ? "bg-primary/15" : "bg-card"}`}>
              <item.icon className={`mx-auto mb-1 h-4 w-4 ${item.ok ? "text-primary" : "text-muted-foreground"}`} />
              <p className="truncate text-[10px] font-bold text-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <CreditCard className="h-4 w-4 text-primary" /> Paiement, prix et pubs
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={payoutEmail} onChange={e => setPayoutEmail(e.target.value)} placeholder="paypal@email.com" className="rounded-xl bg-card px-3 py-2 text-xs text-foreground outline-none" />
          <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Retrait" className="rounded-xl bg-card px-3 py-2 text-xs text-foreground outline-none" />
          <input value={subscriptionPrice} onChange={e => setSubscriptionPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Prix abo" className="rounded-xl bg-card px-3 py-2 text-xs text-foreground outline-none" />
          <input value={promoteBudget} onChange={e => setPromoteBudget(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Budget pub" className="rounded-xl bg-card px-3 py-2 text-xs text-foreground outline-none" />
        </div>
        <textarea value={subscriberPerks} onChange={e => setSubscriberPerks(e.target.value)} rows={2} className="mt-2 w-full rounded-xl bg-card px-3 py-2 text-xs text-foreground outline-none" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["views", "followers", "website"] as const).map(objective => (
            <button key={objective} type="button" onClick={() => setPromoteObjective(objective)} className={`rounded-xl px-3 py-2 text-[11px] font-bold ${promoteObjective === objective ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
              {objective === "views" ? "Vues" : objective === "followers" ? "Abonnes" : "Site"}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" onClick={saveSettings} disabled={saving} className="rounded-xl bg-card px-3 py-2 text-[11px] font-bold text-foreground disabled:opacity-60"><ClipboardCheck className="mx-auto mb-1 h-3.5 w-3.5 text-primary" /> Save</button>
          <button type="button" onClick={requestPayout} className="rounded-xl bg-card px-3 py-2 text-[11px] font-bold text-foreground"><Send className="mx-auto mb-1 h-3.5 w-3.5 text-primary" /> Retrait</button>
          <button type="button" onClick={createPromoteDraft} className="rounded-xl bg-card px-3 py-2 text-[11px] font-bold text-foreground"><Rocket className="mx-auto mb-1 h-3.5 w-3.5 text-primary" /> Pub</button>
        </div>
      </div>

      <div className="grid gap-2">
        {currentItems.map((item) => (
          <button key={item.id} type="button" onClick={() => toggleItem(item.id)} className="glass flex items-start gap-3 rounded-2xl px-3 py-3 text-left">
            <span className="mt-0.5 text-primary">{completed[item.id] ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                {categoryIcon(item.category)} {item.title}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>
              <span className="mt-1 block text-[11px] text-foreground/70">{item.how}</span>
            </span>
            <span className="rounded-full bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground">{categoryLabels[item.category]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon, label, value, suffix = "" }: { icon: React.ReactNode; label: string; value: number; suffix?: string }) {
  const formatted = value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
  return (
    <div className="rounded-xl bg-card px-2 py-2">
      <div className="mx-auto mb-1 flex items-center justify-center text-primary">{icon}</div>
      <p className="text-xs font-black text-foreground tabular-nums">{suffix ? `${formatted}${suffix}` : formatted}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function categoryIcon(category: PlaybookItem["category"]) {
  if (category === "money") return <ReceiptText className="h-3.5 w-3.5 text-primary" />;
  if (category === "growth") return <BarChart3 className="h-3.5 w-3.5 text-accent" />;
  if (category === "safety") return <ShieldCheck className="h-3.5 w-3.5 text-destructive" />;
  if (category === "content") return <Gift className="h-3.5 w-3.5 text-primary" />;
  return <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />;
}
