
## Décisions par défaut (puisque tu m'as laissé choisir)

- **Domaine partage** : variable `VITE_PUBLIC_SITE_URL` (fallback `https://bardeur2.lovable.app`). Quand tu connectes ton domaine, on change juste la variable.
- **Durées ban** : presets (1h / 24h / 7j / 30j) + champ libre (heures).
- **Ordre** : (1) Stories qui ne s'affichent pas → bloquant, (2) Commentaires threadés + perf, (3) Admin ban + DM riches, (4) Partage/QR, (5) Onboarding 3D + suggestions.

---

## 1. Fix affichage stories (priorité absolue)

**Diagnostic suspecté** : la RLS `Stories visible by audience` filtre `expires_at > now()` mais le `SELECT` côté rail filtre déjà ça → OK. Le vrai problème probable : le bucket `media` upload réussit mais l'URL publique est bloquée OU le filtre `audience='friends'` exige un follow mutuel et tu testes seul. Je vérifie via `read_query` les stories réelles en DB puis :
- Loggue `[stories] fetched N rows` dans `StoriesRail` pour diagnostiquer en prod
- Le rail recharge déjà via channel realtime → ajoute un fallback de visibilité sur le compte propriétaire (`auth.uid() = user_id`) déjà présent dans RLS, on vérifie que ça matche
- **Où sont visibles tes stories** : Public = rail home + page Explore pour tout le monde (connecté ou invité) ; Friends = uniquement utilisateurs qui te suivent ET que tu suis (follow mutuel)

**Réponse à ta question "on les voit où ?"** : aujourd'hui uniquement dans le rail horizontal en haut de la page d'accueil (Index). J'ajoute aussi le rail sur Explore pour plus de visibilité.

## 2. Commentaires threadés + perf + clic profil

**Refonte `CommentsDrawer.tsx`** :
- **Threads à 1 niveau** style TikTok : bouton "Répondre" sous chaque commentaire, les réponses s'affichent indentées sous le parent (utilise déjà la colonne `parent_id` existante)
- **Clic sur @username** → navigue vers `/profile/:username`
- **Affichage immédiat** du commentaire posté en optimistic UI (pas d'attente serveur)
- **Virtualisation légère** : pagination par 20, bouton "Voir plus" pour éviter de tout charger
- **Responsive** : drawer prend `100dvh` mobile, max-h 75vh desktop, scroll interne fluide
- **Avatar + display_name** du commentateur immédiatement visibles via join `profiles`

## 3. Admin : ban temp/définitif + DM riches

**DB** : ajouter colonnes à `banned_users` : `expires_at timestamptz nullable`, `is_permanent bool default true`. Trigger nettoyage auto quand `expires_at < now()`.

**Composant `AuthGuard`** : si user est dans `banned_users` actif → affiche écran pro plein écran "Compte suspendu — Raison : X — Expire : Y / Permanent" avec bouton "Contacter le support", bloque toute navigation.

**Page Admin** :
- Sélecteur user → bouton **Bannir** ouvre modal (presets 1h/24h/7j/30j + custom heures + raison + checkbox "Permanent")
- Bouton **Débannir** visible si user banni
- **Envoyer message** : champ texte + bouton joindre image/audio/vidéo (réutilise upload `media` bucket) → utilise `send_admin_official_message` existante, étendue pour accepter `media_url` + `media_type`

## 4. Partage / QR sans lovable

- Créer `src/lib/publicUrl.ts` : `getPublicUrl(path)` lit `import.meta.env.VITE_PUBLIC_SITE_URL || 'https://bardeur2.lovable.app'`
- Remplacer toutes les occurrences `lovable.app` / `window.location.origin` dans les liens partagés (profil, vidéo, QR code) par ce helper
- QR code généré pointe vers `{PUBLIC_URL}/profile/{username}` ou `/video/{id}`

## 5. Onboarding 3D + suggestions

- Nouveau composant `OnboardingFlow.tsx` déclenché à la première connexion (flag `onboarding_completed` sur profile → migration)
- 3 étapes : (a) Welcome 3D avec animation Framer Motion (cubes flottants, gradient, parallax tilt) (b) Bio rapide skippable (c) **Suggestions de comptes** : 8 users top XP, chaque carte avec bouton "Suivre" + bouton "Passer" global en haut **toujours visible**
- Bouton "Passer" valide `onboarding_completed=true` sans suivre personne

---

## Section technique

**Migrations SQL** :
- `ALTER TABLE banned_users ADD COLUMN expires_at timestamptz, ADD COLUMN is_permanent bool DEFAULT true`
- `ALTER TABLE profiles ADD COLUMN onboarding_completed bool DEFAULT false`
- Fonction `is_user_banned(uuid)` security definer pour AuthGuard
- RLS stories : vérifier qu'aucune policy duplicate ne casse `friends`

**Fichiers créés** :
- `src/components/OnboardingFlow.tsx`
- `src/components/BanGate.tsx`
- `src/components/admin/BanUserDialog.tsx`
- `src/components/admin/AdminMessageComposer.tsx`
- `src/lib/publicUrl.ts`

**Fichiers édités** :
- `StoriesRail.tsx`, `CommentsDrawer.tsx`, `AdminPage.tsx`, `AuthGuard.tsx`, `ProfilePage.tsx` (QR), `App.tsx` (OnboardingFlow mount), `useAuth.tsx` (banned check + onboarding flag)

**Hors scope ce cycle** (à demander si tu veux) : threads N niveaux, notifications push de ban, animations Three.js (on reste sur Framer Motion 3D pour rester léger PWA).

---

Confirme ou ajuste l'ordre/le périmètre et j'enchaîne tout.
