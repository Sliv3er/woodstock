const router = require('express').Router();
const { query } = require('../config/db');
const { asyncHandler, paginate, orderBy, isDate } = require('../utils/helpers');

const TYPES = ['sale', 'sale_cancel', 'payment', 'purchase', 'stock_in', 'stock_out', 'adjustment'];

function transactionFilters(q) {
  const where = ['1 = 1'];
  const params = [];
  const types = String(q.type || '')
    .split(',')
    .filter((t) => TYPES.includes(t));
  if (types.length) {
    where.push('t.type IN (?)');
    params.push(types);
  }
  if (isDate(q.from)) {
    where.push('t.transaction_date >= ?');
    params.push(`${q.from} 00:00:00`);
  }
  if (isDate(q.to)) {
    where.push('t.transaction_date <= ?');
    params.push(`${q.to} 23:59:59`);
  }
  if (q.search) {
    where.push('(t.description LIKE ? OR t.reference LIKE ?)');
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

const SORTS = { date: 't.transaction_date', amount: 't.amount', type: 't.type', reference: 't.reference' };

// Journal : filtres par date / catégorie, recherche, tri, pagination
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paginate(req.query, { defaultLimit: 25 });
    const { whereSql, params } = transactionFilters(req.query);
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM transactions t ${whereSql}`, params);
    const sort = req.query.sort ? orderBy(req.query, SORTS, 'date') : 't.transaction_date DESC';
    const data = await query(
      `SELECT t.id, t.transaction_date, t.type, t.amount, t.reference, t.description, t.invoice_id, t.payment_id,
              t.stock_movement_id, t.product_id, t.customer_id, t.supplier_id, u.full_name AS user_name
         FROM transactions t JOIN users u ON u.id = t.user_id
         ${whereSql} ORDER BY ${sort}, t.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const byType = await query(`SELECT t.type, COUNT(*) AS count, COALESCE(SUM(t.amount), 0) AS amount FROM transactions t ${whereSql} GROUP BY t.type`, params);
    res.json({ data, total, page, limit, totals: byType });
  })
);

// Synthèses quotidienne et mensuelle (ventes nettes, encaissements, achats, mouvements)
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { whereSql, params } = transactionFilters({ from: req.query.from, to: req.query.to });
    const aggregates = `
      COUNT(*) AS operations,
      COALESCE(SUM(CASE WHEN t.type IN ('sale', 'sale_cancel') THEN t.amount END), 0) AS sales,
      COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount END), 0) AS payments,
      COALESCE(SUM(CASE WHEN t.type = 'purchase' THEN t.amount END), 0) AS purchases,
      COALESCE(SUM(t.type IN ('purchase', 'stock_in')), 0) AS stock_in_count,
      COALESCE(SUM(t.type = 'stock_out'), 0) AS stock_out_count,
      COALESCE(SUM(t.type = 'adjustment'), 0) AS adjustment_count`;
    const daily = await query(
      `SELECT DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS period, ${aggregates}
         FROM transactions t ${whereSql} GROUP BY period ORDER BY period DESC LIMIT 366`,
      params
    );
    const monthly = await query(
      `SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') AS period, ${aggregates}
         FROM transactions t ${whereSql} GROUP BY period ORDER BY period DESC LIMIT 60`,
      params
    );
    const [totals] = await query(`SELECT ${aggregates} FROM transactions t ${whereSql}`, params);
    res.json({ daily, monthly, totals });
  })
);

module.exports = router;
module.exports.transactionFilters = transactionFilters;
