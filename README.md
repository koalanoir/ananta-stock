# Ananta Stock

MVP d’un SaaS de gestion de stock simple pour les commerces. L’interface reprend les maquettes Ananta Stock et cible deux rôles : propriétaire et gestionnaire.

## Parcours disponible

- Tableau de bord propriétaire
- Liste, recherche et filtrage des articles
- Ajout d’un article en mode démonstration
- Entrée, sortie, perte et ajustement en mode démonstration
- Historique des mouvements
- Comptage rapide adapté au mobile
- Schéma PostgreSQL/Supabase multi-tenant avec RLS

Les écrans utilisent temporairement les données de `src/lib/demo-data.ts`. Le schéma Supabase est prêt à être appliqué, mais l’authentification et les lectures réelles seront branchées dans l’incrément suivant.

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
4. Exécuter `supabase/migrations/001_initial_schema.sql` depuis le SQL Editor ou avec la CLI Supabase.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Ne jamais exposer la clé `service_role` dans une variable `NEXT_PUBLIC_*`.

## Principes métier

- Chaque entreprise est isolée par `organization_id` et des politiques RLS.
- Le propriétaire gère les articles et utilisateurs.
- Le gestionnaire consulte le stock et enregistre les mouvements.
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
