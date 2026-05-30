// api/boamp.js — Proxy serverless vers l'API BOAMP
// Stratégie : 3 requêtes séparées par mots-clés via where=search()
// puis fusion et déduplication côté serveur

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const today = new Date().toISOString().split('T')[0];

  const SELECT = [
    'id_boamp','dateparution','objet','lieu_execution',
    'nature','nature_marche','cpv','typemarche','acheteur',
    'datelimitereponse','urlboamp','valeur_marche','valeur_estimee'
  ].join(',');

  // Groupes de mots-clés — séparés en 3 requêtes pour rester sous la limite de taille URL
  const KEYWORD_GROUPS = [
    // Équipements scolaires et sportifs
    ['ecole', 'scolaire', 'college', 'lycee', 'gymnase', 'maternelle', 'primaire'],
    // Logements
    ['logement', 'logements', 'residence', 'habitat', 'hlm', 'locatif'],
    // Architecture / MOE
    ['architecte', 'maitrise oeuvre', 'maitre oeuvre', 'moe'],
  ];

  async function fetchGroup(keywords) {
    // search() dans where= fonctionne mot par mot sans accent
    const whereKw = keywords.map(k => `search(objet, "${k}")`).join(' OR ');
    const where = `(${whereKw}) AND datelimitereponse >= "${today}"`;

    const params = new URLSearchParams({
      lang: 'fr',
      timezone: 'Europe/Paris',
      select: SELECT,
      limit: '100',
      where: where
    });
    params.append('refine', 'nature_categorise_libelle:Avis de marché');

    const url = `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?${params}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`BOAMP HTTP ${r.status}: ${txt.substring(0, 200)}`);
    }
    const json = await r.json();
    return json.results || [];
  }

  try {
    // Requêtes parallèles
    const results = await Promise.allSettled(
      KEYWORD_GROUPS.map(g => fetchGroup(g))
    );

    // Fusionner + dédupliquer
    const seen = new Set();
    const allRecords = [];
    const errors = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const r of result.value) {
          if (!seen.has(r.id_boamp)) {
            seen.add(r.id_boamp);
            allRecords.push(r);
          }
        }
      } else {
        errors.push(result.reason?.message || 'Erreur inconnue');
      }
    }

    // Si toutes les requêtes ont échoué
    if (allRecords.length === 0 && errors.length === KEYWORD_GROUPS.length) {
      return res.status(502).json({ error: 'Toutes les requêtes BOAMP ont échoué', details: errors });
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    return res.status(200).json({
      results: allRecords,
      total_count: allRecords.length,
      _meta: { today, errors }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
