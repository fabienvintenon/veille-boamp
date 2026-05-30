// api/boamp.js — Proxy BOAMP
// Syntaxe validée par aufilduboamp.com : q=dateparution:2026 + refine.descripteur_code
// On utilise l'ancienne API v1 qui supporte refine.xxx (plus permissive)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const today = new Date().toISOString().split('T')[0];
  const year  = new Date().getFullYear();

  const SELECT = [
    'id_boamp','dateparution','objet','lieu_execution',
    'nature','nature_marche','cpv','typemarche','acheteur',
    'datelimitereponse','urlboamp','valeur_marche','valeur_estimee',
    'descripteur_code','descripteur_libelle'
  ].join(',');

  // Codes descripteurs BOAMP pour l'architecture / construction
  // 600=AMO construction, 055=Construction bâtiment, 099=Études et maîtrise d'oeuvre,
  // 168=Logement, 116=École, 154=Gymnase, 062=Établissement scolaire
  const DESCRIPTEUR_CODES = ['600', '055', '099', '168', '116', '154', '062', '433'];

  // On fait une requête par descripteur en parallèle
  // Syntaxe v1 : refine.descripteur_code=XXX&q=dateparution:YYYY
  async function fetchByDescripteur(code) {
    const url = `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?` +
      `select=${encodeURIComponent(SELECT)}` +
      `&refine=descripteur_code%3A${code}` +
      `&refine=nature_categorise_libelle%3AAvis%20de%20march%C3%A9` +
      `&where=${encodeURIComponent(`datelimitereponse >= "${today}"`)}` +
      `&limit=100&lang=fr&timezone=Europe%2FParis`;

    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`HTTP ${r.status} code=${code}: ${txt.substring(0,150)}`);
    }
    const json = await r.json();
    return json.results || [];
  }

  try {
    const settled = await Promise.allSettled(
      DESCRIPTEUR_CODES.map(code => fetchByDescripteur(code))
    );

    const seen = new Set();
    const allRecords = [];
    const errors = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        for (const r of result.value) {
          if (r.id_boamp && !seen.has(r.id_boamp)) {
            seen.add(r.id_boamp);
            allRecords.push(r);
          }
        }
      } else {
        errors.push(result.reason?.message || 'Erreur inconnue');
      }
    }

    // Log pour debug dans les logs Vercel
    console.log(`BOAMP: ${allRecords.length} AO récupérés, ${errors.length} erreurs`, errors);

    return res.status(200).json({
      results: allRecords,
      total_count: allRecords.length,
      _meta: { today, errors, codes: DESCRIPTEUR_CODES }
    });

  } catch (err) {
    console.error('BOAMP fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
