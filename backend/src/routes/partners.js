const express = require('express');
const { query } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, reqStr, optStr, optEmail } = require('../middleware/validate');
const { AppError, asyncHandler, paginate, orderBy } = require('../utils/helpers');

const schema = z.object({
  name: reqStr(160),
  phone: optStr(30),
  email: optEmail(),
  address: optStr(255),
  tax_id: optStr(40),
  notes: optStr(2000),
});

const FIELDS = ['name', 'phone', 'email', 'address', 'tax_id', 'notes'];
const SORTS = { name: 't.name', created_at: 't.created_at' };

/**
 * Routes CRUD communes aux clients et aux fournisseurs.
 * `table` provient uniquement du code (jamais de la requête) : pas d'injection possible.
 */
function partnerRouter(table) {
  const router = express.Router();
  const isCustomer = table === 'customers';
  const label = isCustomer ? 'Client' : 'Fournisseur';

  // Indicateurs affichés dans la liste
  const stats = isCustomer
    ? `(SELECT COUNT(*) FROM invoices i WHERE i.customer_id = t.id AND i.status = 'confirmed') AS invoice_count,
       (SELECT COALESCE(SUM(i.total_ttc), 0) FROM invoices i WHERE i.customer_id = t.id AND i.status = 'confirmed') AS total_invoiced,
       (SELECT COALESCE(SUM(i.total_ttc - i.amount_paid), 0) FROM invoices i WHERE i.customer_id = t.id AND i.status = 'confirmed') AS balance`
    : `(SELECT COUNT(*) FROM products p WHERE p.supplier_id = t.id AND p.is_active = 1) AS product_count,
       (SELECT COUNT(*) FROM stock_movements m WHERE m.supplier_id = t.id) AS entry_count,
       (SELECT COALESCE(SUM(m.quantity * m.unit_cost), 0) FROM stock_movements m WHERE m.supplier_id = t.id) AS total_purchased`;

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { limit, page, offset } = paginate(req.query);
      const params = [];
      let whereSql = '';
      if (req.query.search) {
        whereSql = 'WHERE (t.name LIKE ? OR t.phone LIKE ? OR t.email LIKE ? OR t.tax_id LIKE ? OR t.address LIKE ?)';
        const like = `%${req.query.search}%`;
        params.push(like, like, like, like, like);
      }
      const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${table} t ${whereSql}`, params);
      const data = await query(
        `SELECT t.*, ${stats} FROM ${table} t ${whereSql} ORDER BY ${orderBy(req.query, SORTS, 'name')} LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json({ data, total, page, limit });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const [partner] = await query(`SELECT t.*, ${stats} FROM ${table} t WHERE t.id = ?`, [req.params.id]);
      if (!partner) throw new AppError(404, `${label} introuvable`);

      if (isCustomer) {
        // Historique d'achats du client
        const invoices = await query(
          `SELECT id, invoice_number, invoice_date, status, payment_status, total_ttc, amount_paid, (total_ttc - amount_paid) AS balance
             FROM invoices WHERE customer_id = ? AND status <> 'draft' ORDER BY invoice_date DESC, id DESC`,
          [req.params.id]
        );
        const payments = await query(
          `SELECT p.id, p.payment_date, p.amount, p.method, p.reference, i.invoice_number, p.invoice_id
             FROM payments p JOIN invoices i ON i.id = p.invoice_id
            WHERE p.customer_id = ? ORDER BY p.payment_date DESC, p.id DESC`,
          [req.params.id]
        );
        const topProducts = await query(
          `SELECT ii.product_id, ii.description, ii.unit, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS total_ht
             FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
            WHERE i.customer_id = ? AND i.status = 'confirmed'
            GROUP BY ii.product_id, ii.description, ii.unit ORDER BY total_ht DESC LIMIT 8`,
          [req.params.id]
        );
        return res.json({ ...partner, invoices, payments, top_products: topProducts });
      }

      // Entrées de stock et produits liés au fournisseur
      const entries = await query(
        `SELECT m.id, m.created_at, m.quantity, m.unit_cost, (m.quantity * m.unit_cost) AS total, m.reference, m.notes,
                p.id AS product_id, p.sku, p.name AS product_name, p.unit
           FROM stock_movements m JOIN products p ON p.id = m.product_id
          WHERE m.supplier_id = ? ORDER BY m.created_at DESC, m.id DESC`,
        [req.params.id]
      );
      const products = await query(
        `SELECT id, sku, name, unit, quantity, min_stock, purchase_price FROM products WHERE supplier_id = ? AND is_active = 1 ORDER BY name`,
        [req.params.id]
      );
      res.json({ ...partner, entries, products });
    })
  );

  router.post(
    '/',
    validate(schema),
    asyncHandler(async (req, res) => {
      const result = await query(`INSERT INTO ${table} (${FIELDS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?)`, FIELDS.map((f) => req.body[f]));
      res.status(201).json({ id: result.insertId, ...req.body });
    })
  );

  router.put(
    '/:id',
    validate(schema),
    asyncHandler(async (req, res) => {
      const result = await query(`UPDATE ${table} SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
        ...FIELDS.map((f) => req.body[f]),
        req.params.id,
      ]);
      if (!result.affectedRows) throw new AppError(404, `${label} introuvable`);
      res.json({ id: Number(req.params.id), ...req.body });
    })
  );

  // Garde-fou : impossible de supprimer un tiers lié à des documents
  router.delete(
    '/:id',
    authorize('admin'),
    asyncHandler(async (req, res) => {
      const pid = req.params.id;
      if (isCustomer) {
        const [{ n }] = await query('SELECT COUNT(*) AS n FROM invoices WHERE customer_id = ?', [pid]);
        if (n > 0) throw new AppError(409, `Suppression impossible : ce client est lié à ${n} facture(s)`);
      } else {
        const [{ n }] = await query('SELECT COUNT(*) AS n FROM stock_movements WHERE supplier_id = ?', [pid]);
        if (n > 0) throw new AppError(409, `Suppression impossible : ce fournisseur est lié à ${n} entrée(s) de stock`);
      }
      const result = await query(`DELETE FROM ${table} WHERE id = ?`, [pid]);
      if (!result.affectedRows) throw new AppError(404, `${label} introuvable`);
      res.json({ message: `${label} supprimé` });
    })
  );

  return router;
}

module.exports = partnerRouter;
