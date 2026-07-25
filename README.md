# Ananta Stock

MVP d’un SaaS de gestion de stock, de vente et de facturation pour les commerces. L’interface cible les propriétaires, gestionnaires et vendeurs.

## Parcours disponible

- Tableau de bord de performance et rentabilité
- Liste, recherche, filtrage et gestion des articles
- Ventes, entrées, pertes, ajustements et comptage rapide
- Historique des mouvements
- Factures multi-produits avec PDF, téléchargement, envoi e-mail et réimpression
- CRM léger : coordonnées, historique, dépenses et nombre d’achats
- Suivi des sessions et horaires vendeurs
- Schéma PostgreSQL/Supabase multi-tenant avec RLS

## Démarrage local

Prérequis : Node.js 20.9 ou supérieur.

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Configuration Supabase

1. Créer un projet Supabase.
2. Copier `.env.example` vers `.env.local`.
3. Renseigner l’URL et la clé publique du projet.
4. Exécuter les fichiers de `supabase/migrations` dans l’ordre depuis le SQL Editor ou avec la CLI Supabase.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ne jamais exposer la clé `service_role` dans une variable `NEXT_PUBLIC_*`.

## Envoi des factures

L’application génère les PDF localement avec jsPDF. Pour l’envoi automatique, valider un domaine dans Resend puis renseigner :

```env
RESEND_API_KEY=re_xxxxxxxxx
INVOICE_FROM_EMAIL=Ananta Stock <factures@your-domain.com>
```

Sans ces deux variables, la création et le téléchargement des factures restent disponibles ; seul l’envoi e-mail est désactivé.

## Principes métier

- Chaque entreprise est isolée par `organization_id` et des politiques RLS.
- Le propriétaire et le gestionnaire administrent le catalogue et le CRM.
- Le vendeur enregistre les ventes, factures, pertes et comptages de sa boutique.
- Le solde courant est mis à jour par une fonction PostgreSQL transactionnelle.
- Un mouvement ne se supprime pas : une erreur est corrigée par un mouvement inverse.
- Une clé d’idempotence empêche les doubles mouvements lors d’une nouvelle tentative réseau.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```
