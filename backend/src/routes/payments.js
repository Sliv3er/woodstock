const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, optStr, optDate, id } = require('../middleware/validate');
const { asyncHandler, paginate, isDate } = require('../utils/helpers');
const invoices = require('../services/invoiceService');

const METHODS = ['cash', 'bank_transfer', 'cheque', 'other'];

const paymentSchema = z.object({
  invoice_id: id(),
  amount: z.coerce.number().positive().max(999999999),
  method: z.enum(METHODS),
  payment_date: optDate(),
  reference: optStr(60),
  notes: optStr(255),
});

function paymentFilters(q) {
  const where = ['1 = 1'];
  const params = [];
  if (METHODS.includes(q.method)) {
    where.push('p.method = ?');
    params.push(q.method);
  }
  if (q.customer_id) {
    where.push('p.customer_id = ?');
    params.push(q.customer_id);
  }
  if (isDate(q.from)) {
    where.push('p.payment_date >= ?');
    params.push(q.from);
  }
  if (isDate(q.to)) {
    where.push('p.payment_date <= ?');
    params.push(q.to);
  }
  if (q.search) {
    where.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR p.reference LIKE ?)');
    const like = `%${q.search}%`;
    params.push(like, like, like);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

const PAYMENT_FROM = `
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  JOIN customers c ON c.id = p.customer_id
  JOIN users u ON u.id = p.created_by`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paginate(req.query);
    const { whereSql, params } = paymentFilters(req.query);
    const [{ total, amount }] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(p.amount), 0) AS amount ${PAYMENT_FROM} ${whereSql}`, params);
    const data = await query(
      `SELECT p.id, p.invoice_id, i.invoice_number, p.customer_id, c.name AS customer_name, p.payment_date, p.amount, p.method,
              p.reference, p.notes, u.full_name AS created_by_name, p.created_at
         ${PAYMENT_FROM} ${whereSql} ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data, total, total_amount: amount, page, limit });
  })
);

router.post(
  '/',
  validate(paymentSchema),
  asyncHandler(async (req, res) => {
    const paymentId = await withTransaction((conn) => invoices.addPayment(conn, req.body, req.user.id));
    const [payment] = await query('SELECT * FROM payments WHERE id = ?', [paymentId]);
    res.status(201).json(payment);
  })
);

// Correction d'une erreur de saisie : réservée à l'administrateur
router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    await withTransaction((conn) => invoices.deletePayment(conn, Number(req.params.id)));
    res.json({ message: 'Paiement supprimé' });
  })
);

module.exports = router;
module.exports.paymentFilters = paymentFilters;
module.exports.PAYMENT_FROM = PAYMENT_FROM;
