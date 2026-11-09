const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, reqStr, optStr, money, percent } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../utils/helpers');
const settings = require('../services/settingsService');

// Lecture : tout utilisateur connecté (nécessaire pour les factures)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const all = await settings.getAll();
    const company = {};
    for (const k of settings.COMPANY_KEYS) company[k] = all[k] || '';
    res.json({
      company,
      stamp_duty: all.stamp_duty,
      currency: all.currency || 'DT',
      demo_mode: all.demo_mode,
      vat_rates: await settings.getVatRates({ activeOnly: req.query.all !== '1' }),
    });
  })
);

// Mise à jour des informations de la société et du timbre fiscal
router.put(
  '/',
  authorize('admin'),
  validate(
    z.object({
      company_name: reqStr(160),
      company_activity: optStr(200),
      company_address: optStr(255),
      company_phone: optStr(40),
      company_email: optStr(160),
      company_tax_id: optStr(40),
      company_rib: optStr(60),
      invoice_footer: optStr(300),
      stamp_duty: money().max(1000),
    })
  ),
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body).map(([k, v]) => [k, v == null ? '' : String(v)]);
    await query('INSERT INTO settings (setting_key, setting_value) VALUES ? ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [entries]);
    res.json({ message: 'Paramètres enregistrés' });
  })
);

// ---- Taux de TVA configurables --------------------------------------------------
const vatSchema = z.object({
  label: reqStr(60),
  rate: percent(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

async function saveVat(conn, vatId, b) {
  const [[dup]] = await conn.query('SELECT id FROM vat_rates WHERE rate = ? AND id <> ?', [b.rate, vatId || 0]);
  if (dup) throw new AppError(409, `Un taux de ${b.rate} % existe déjà`);
  if (b.is_default && !b.is_active) throw new AppError(400, 'Le taux par défaut doit être actif');

  let savedId = vatId;
  if (vatId) {
    const [result] = await conn.query('UPDATE vat_rates SET label = ?, rate = ?, is_active = ? WHERE id = ?', [b.label, b.rate, b.is_active ? 1 : 0, vatId]);
    if (!result.affectedRows) throw new AppError(404, 'Taux de TVA introuvable');
  } else {
    const [result] = await conn.query('INSERT INTO vat_rates (label, rate, is_active) VALUES (?, ?, ?)', [b.label, b.rate, b.is_active ? 1 : 0]);
    savedId = result.insertId;
  }
  if (b.is_default) {
    await conn.query('UPDATE vat_rates SET is_default = (id = ?)', [savedId]);
  } else {
    await conn.query('UPDATE vat_rates SET is_default = 0 WHERE id = ?', [savedId]);
  }
  // Il doit toujours exister un taux par défaut actif
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM vat_rates WHERE is_default = 1 AND is_active = 1');
  if (n === 0) throw new AppError(409, 'Un taux de TVA par défaut actif est obligatoire : définissez d’abord un autre taux par défaut');
  return savedId;
}

router.post(
  '/vat-rates',
  authorize('admin'),
  validate(vatSchema),
  asyncHandler(async (req, res) => {
    const vatId = await withTransaction((conn) => saveVat(conn, null, req.body));
    res.status(201).json({ id: vatId, ...req.body });
  })
);

router.put(
  '/vat-rates/:id',
  authorize('admin'),
  validate(vatSchema),
  asyncHandler(async (req, res) => {
    await withTransaction((conn) => saveVat(conn, Number(req.params.id), req.body));
    res.json({ id: Number(req.params.id), ...req.body });
  })
);

router.delete(
  '/vat-rates/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const [vat] = await query('SELECT is_default FROM vat_rates WHERE id = ?', [req.params.id]);
    if (!vat) throw new AppError(404, 'Taux de TVA introuvable');
    if (vat.is_default) throw new AppError(409, 'Le taux par défaut ne peut pas être supprimé');
    // Les factures conservent leur propre copie du taux : la suppression est sans effet sur l'historique
    await query('DELETE FROM vat_rates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Taux supprimé' });
  })
);

module.exports = router;
