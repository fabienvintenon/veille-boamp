// api/boamp.js — Proxy BOAMP
// Utilise l'endpoint /exports/json (pas de limite de records, syntaxe simple)
// + refine sur code_departement pour cibler les zones

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const today = new Date().toISOString().split('T')[0];

  const SELECT = [
    'id_boamp','dateparution','objet','lieu_execution',
    'nature','nature_marche','cpv','typemarche','acheteur',
    'datelimitereponse','urlboamp','valeur_marche','valeur_estimee'
  ].join(',');

  // Départements cibles — équipements : toute France via plusieurs requêtes
  // Logements : PACA + Vichy + Annemasse
  // On fait 3 requêtes : CPV archi France entière + logements zones cibles
  const QUERIES = [
    // Requête 1 : CPV maîtrise d'oeuvre / architecture — toute France
    { refine: ['nature_categorise_libelle:Avis de marché', 'cpv:71221'], label: 'CPV MOE' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'cpv:71222'], label: 'CPV archi' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'cpv:71240'], label: 'CPV supervision' },
    // Requête 2 : par département — PACA
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:06'], label: 'Alpes-Maritimes' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:13'], label: 'Bouches-du-Rhône' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:83'], label: 'Var' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:84'], label: 'Vaucluse' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:04'], label: 'Alpes-HP' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:05'], label: 'Hautes-Alpes' },
    // Requête 3 : Vichy + Annemasse
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:03'], label: 'Allier' },
    { refine: ['nature_categorise_libelle:Avis de marché', 'code_departement:74'], label: 'Haute-Savoie' },
  ];

  async function fetchQuery(q) {
    // /exports/json supporte refine sans where= complexe
    const base = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/exports/json';
    const params = new URLSearchParams({
      select: SELECT,
      limit: '100',
      lang: 'fr',
      timezone: 'Europe/Paris',
      where: `datelimitereponse >= "${today}"`
    });
    for (const r of q.refine) params.append('refine', r);

    const url = `${base}?${params}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`[${q.label}] HTTP ${resp.status}: ${txt.substring(0, 200)}`);
    }
    const json = await resp.json();
    // /exports/json retourne un tableau directement (pas { results: [] })
    return Array.isArray(json) ? json : (json.results || []);
  }

  try {
    const settled = await Promise.allSettled(QUERIES.map(q => fetchQuery(q)));

    const seen = new Set();
    const allRecords = [];
    const errors = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'fulfilled') {
        for (const r of result.value) {
          const key = r.id_boamp || JSON.stringify(r).substring(0, 50);
          if (!seen.has(key)) {
            seen.add(key);
            allRecords.push(r);
          }
        }
      } else {
        errors.push(result.reason?.message || `Erreur requête ${i}`);
        console.error('BOAMP query error:', result.reason?.message);
      }
    }

    console.log(`BOAMP: ${allRecords.length} AO, ${errors.length} erreurs sur ${QUERIES.length} requêtes`);
    if (errors.length > 0) console.error('Erreurs:', errors);

    if (allRecords.length === 0 && errors.length === QUERIES.length) {
      return res.status(502).json({
        error: 'Toutes les requêtes BOAMP ont échoué',
        details: errors.slice(0, 3)
      });
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    return res.status(200).json({
      results: allRecords,
      total_count: allRecords.length,
      _meta: { today, errors }
    });

  } catch (err) {
    console.error('BOAMP fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
