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

  const KEYWORD_GROUPS = [
    ['ecole', 'scolaire', 'college', 'lycee', 'gymnase', 'maternelle', 'primaire'],
    ['logement', 'logements', 'residence', 'habitat', 'hlm', 'locatif', 'icf'],
    ['architecte', 'maitrise oeuvre', 'maitre oeuvre'],
  ];

  async function fetchGroup(keywords) {
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
    if (!r.ok) throw new Error(`BOAMP HTTP ${r.status}`);
    const json = await r.json();
    return json.results || [];
  }

  try {
    const results = await Promise.allSettled(KEYWORD_GROUPS.map(g => fetchGroup(g)));

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
