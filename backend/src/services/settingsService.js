const { query } = require('../config/db');

const COMPANY_KEYS = [
  'company_name',
  'company_activity',
  'company_address',
  'company_phone',
  'company_email',
  'company_tax_id',
  'company_rib',
  'invoice_footer',
];

/** Paramètres sous forme d'objet { clé: valeur }. `runner` = pool ou connexion transactionnelle. */
async function getAll(runner) {
  const rows = runner ? (await runner.query('SELECT setting_key, setting_value FROM settings'))[0] : await query('SELECT setting_key, setting_value FROM settings');
  const out = {};
  for (const r of rows) out[r.setting_key] = r.setting_value;
  out.stamp_duty = Number(out.stamp_duty) || 0;
  out.demo_mode = out.demo_mode === '1';
  return out;
}

async function getVatRates({ activeOnly = false } = {}) {
  return query(`SELECT id, label, rate, is_default, is_active FROM vat_rates ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY rate DESC`);
}

module.exports = { COMPANY_KEYS, getAll, getVatRates };
