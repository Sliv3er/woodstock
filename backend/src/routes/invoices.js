const router = require('express').Router();
const { pool, query, withTransaction } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, optStr, optDate, id, money, qty, percent } = require('../middleware/validate');
const { AppError, asyncHandler, paginate, orderBy, isDate } = require('../utils/helpers');
const invoices = require('../services/invoiceService');
const settings = require('../services/settingsService');
const { invoicePdf } = require('../services/pdfService');

const invoiceSchema = z.object({
  customer_id: id(),
  invoice_date: optDate(),
  due_date: optDate(),
  discount_percent: percent().default(0),
  vat_rate: percent(),
  stamp_duty: money().max(1000).optional(),
  notes: optStr(2000),
  confirm: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_id: id(),
        description: optStr(200),
        quantity: qty(),
        unit_price: money().optional(),
        discount_percent: percent().default(0),
      })
    )
    .min(1)
    .max(200),
});

const SORTS = {
  date: 'i.invoice_date',
  number: 'i.invoice_number',
  customer: 'c.name',
  total: 'i.total_ttc',
  created_at: 'i.created_at',
};

function invoiceFilters(q) {
  const where = ['1 = 1'];
  const params = [];
  if (q.search) {
    where.push('(i.invoice_number LIKE ? OR c.name LIKE ?)');
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  if (['draft', 'confirmed', 'cancelled'].includes(q.status)) {
    where.push('i.status = ?');
    params.push(q.status);
  }
  if (['unpaid', 'partial', 'paid'].includes(q.payment_status)) {
    where.push("i.status = 'confirmed' AND i.payment_status = ?");
    params.push(q.payment_status);
  }
  if (q.payment_status === 'due') where.push("i.status = 'confirmed' AND i.payment_status IN ('unpaid', 'partial')");
  if (q.customer_id) {
    where.push('i.customer_id = ?');
    params.push(q.customer_id);
  }
  if (isDate(q.from)) {
    where.push('i.invoice_date >= ?');
    params.push(q.from);
  }
  if (isDate(q.to)) {
    where.push('i.invoice_date <= ?');
    params.push(q.to);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paginate(req.query);
    const { whereSql, params } = invoiceFilters(req.query);
    const from = 'FROM invoices i JOIN customers c ON c.id = i.customer_id';
    const [{ total }] = await query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
    const sort = req.query.sort ? `${orderBy(req.query, SORTS, 'date')}, i.id DESC` : 'i.invoice_date DESC, i.id DESC';
    const data = await query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.customer_id, c.name AS customer_name, i.status, i.payment_status,
              i.total_ht, i.vat_amount, i.total_ttc, i.amount_paid, (i.total_ttc - i.amount_paid) AS balance
         ${from} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data, total, page, limit });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await invoices.getFull(pool, req.params.id));
  })
);

// Création (brouillon) — avec `confirm: true`, création + confirmation dans la même transaction
router.post(
  '/',
  validate(invoiceSchema),
  asyncHandler(async (req, res) => {
    const invoiceId = await withTransaction(async (conn) => {
      const newId = await invoices.createDraft(conn, req.body, req.user.id);
      if (req.body.confirm) await invoices.confirm(conn, newId, req.user.id);
      return newId;
    });
    res.status(201).json(await invoices.getFull(pool, invoiceId));
  })
);

router.put(
  '/:id',
  validate(invoiceSchema),
  asyncHandler(async (req, res) => {
    const invoiceId = Number(req.params.id);
    await withTransaction(async (conn) => {
      await invoices.updateDraft(conn, invoiceId, req.body);
      if (req.body.confirm) await invoices.confirm(conn, invoiceId, req.user.id);
    });
    res.json(await invoices.getFull(pool, invoiceId));
  })
);

router.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    await withTransaction((conn) => invoices.confirm(conn, Number(req.params.id), req.user.id));
    res.json(await invoices.getFull(pool, req.params.id));
  })
);

// Annulation contrôlée (administrateur) : le stock est ré-intégré une seule fois
router.post(
  '/:id/cancel',
  authorize('admin'),
  validate(z.object({ reason: optStr(255) })),
  asyncHandler(async (req, res) => {
    await withTransaction((conn) => invoices.cancel(conn, Number(req.params.id), req.user.id, req.body.reason));
    res.json(await invoices.getFull(pool, req.params.id));
  })
);

// Seuls les brouillons peuvent être supprimés
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await withTransaction(async (conn) => {
      const [[invoice]] = await conn.query('SELECT status FROM invoices WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!invoice) throw new AppError(404, 'Facture introuvable');
      if (invoice.status !== 'draft') {
        throw new AppError(409, 'Seul un brouillon peut être supprimé. Une facture confirmée doit être annulée.');
      }
      await conn.query('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    });
    res.json({ message: 'Brouillon supprimé' });
  })
);

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const invoice = await invoices.getFull(pool, req.params.id);
    const company = await settings.getAll();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${invoice.invoice_number}.pdf"`);
    invoicePdf(invoice, company).pipe(res);
  })
);

module.exports = router;
module.exports.invoiceFilters = invoiceFilters;
