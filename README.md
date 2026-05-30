# Veille BOAMP — Agence d'architecture

Dashboard de veille quotidienne des appels d'offres marchés publics.
Source : API BOAMP (DILA) — données ouvertes, licence Etalab 2.0.

---

## Structure du projet

```
veille-boamp/
├── api/
│   └── boamp.js        ← Fonction serverless (proxy vers API BOAMP)
├── public/
│   └── index.html      ← Dashboard frontend
├── package.json
├── vercel.json
└── README.md
```

---

## Déploiement sur Vercel (gratuit, 5 minutes)

### Étape 1 — Créer un compte Vercel
→ https://vercel.com/signup (connexion avec GitHub recommandée)

### Étape 2 — Installer Vercel CLI
```bash
npm install -g vercel
```

### Étape 3 — Déployer
Dans le dossier `veille-boamp/` :
```bash
vercel
```

Répondre aux questions :
- Set up and deploy? → **Y**
- Which scope? → votre compte
- Link to existing project? → **N**
- Project name? → `veille-boamp` (ou ce que vous voulez)
- Directory? → **.** (point = dossier courant)
- Override settings? → **N**

### Étape 4 — Accéder à votre dashboard
Vercel vous donne une URL du type :
```
https://veille-boamp-xxxx.vercel.app
```

C'est votre dashboard, accessible depuis n'importe quel navigateur, partout.

---

## Mise à jour du dashboard

Pour modifier les critères (mots-clés, départements, seuil) :
1. Éditez `public/index.html` section `const CFG = { ... }`
2. Relancez `vercel --prod`

---

## Comment ça fonctionne

```
Votre navigateur
     │
     │  GET /api/boamp  (même domaine → pas de CORS)
     ▼
Vercel Edge Function (api/boamp.js)
     │
     │  GET boamp-datadila.opendatasoft.com/...
     │  (côté serveur → pas de restriction CORS)
     ▼
API BOAMP (DILA)
     │
     └─ JSON → Vercel → Votre navigateur → Tableau filtré
```

---

## Critères de filtrage configurés

**Équipements** (toute la France) :
- école, scolaire, groupe scolaire
- collège, lycée
- gymnase, complexe sportif
- maternelle, primaire

**Logements** (zones cibles uniquement) :
- PACA : 04, 05, 06, 13, 83, 84
- Vichy (Allier) : 03
- Annemasse (Haute-Savoie) : 74

**Seuil montant travaux** : 3 000 000 € HT

---

## Licence des données
API BOAMP — DILA — Licence ouverte Etalab v2.0
https://www.etalab.gouv.fr/licence-ouverte-open-licence
