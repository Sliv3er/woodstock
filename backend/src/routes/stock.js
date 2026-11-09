const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { z, validate, optStr, optId, id, money } = require('../middleware/validate');
const { AppError, asyncHandler, paginate, isDate } = require('../utils/helpers');
const stock = require('../services/stockService');

const movementSchema = z
  .object({
    product_id: id(),
    type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
    quantity: z.coerce.number().positive().max(99999999).optional(),
    new_quantity: money().optional(),
    unit_cost: z.preprocess((v) => (v === '' || v == null ? undefined : v), money().optional()),
    supplier_id: optId(),
    reference: optStr(60),
    notes: optStr(500),
    idempotency_key: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'ADJUSTMENT' && v.new_quantity === undefined) {
      ctx.addIssue({ code: 'custom', path: ['new_quantity'], message: 'Indiquez la quantité réelle constatée' });
    }
    if (v.type !== 'ADJUSTMENT' && v.quantity === undefined) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Champ obligatoire' });
    }
    if (v.type === 'ADJUSTMENT' && !v.notes) {
      ctx.addIssue({ code: 'custom', path: ['notes'], message: "Le motif de l'ajustement est obligatoire" });
    }
  });

/** Clause WHERE commune à la liste et aux exports. */
function movementFilters(q) {
  const where = ['1 = 1'];
  const params = [];
  if (['IN', 'OUT', 'ADJUSTMENT'].includes(q.type)) {
    where.push('m.type = ?');
    params.push(q.type);
  }
  if (q.product_id) {
    where.push('m.product_id = ?');
    params.push(q.product_id);
  }
  if (q.supplier_id) {
    where.push('m.supplier_id = ?');
    params.push(q.supplier_id);
  }
  if (isDate(q.from)) {
    where.push('m.created_at >= ?');
    params.push(`${q.from} 00:00:00`);
  }
  if (isDate(q.to)) {
    where.push('m.created_at <= ?');
    params.push(`${q.to} 23:59:59`);
  }
  if (q.search) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR m.reference LIKE ? OR m.notes LIKE ?)');
    const like = `%${q.search}%`;
    params.push(like, like, like, like);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

const MOVEMENT_SELECT = `
  SELECT m.id, m.product_id, p.sku, p.name AS product_name, p.unit, m.type, m.quantity, m.previous_quantity, m.new_quantity,
         m.unit_cost, m.source, m.reference, m.invoice_id, m.supplier_id, s.name AS supplier_name, m.notes,
         m.user_id, u.full_name AS user_name, m.created_at
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    JOIN users u ON u.id = m.user_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id`;

router.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paginate(req.query);
    const { whereSql, params } = movementFilters(req.query);
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM stock_movements m JOIN products p ON p.id = m.product_id ${whereSql}`, params);
    const data = await query(`${MOVEMENT_SELECT} ${whereSql} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ data, total, page, limit });
  })
);

// Synthèse du stock : valeur, alertes
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const [summary] = await query(
      `SELECT COUNT(*) AS products,
              COALESCE(SUM(quantity * purchase_price), 0) AS stock_value,
              COALESCE(SUM(quantity * selling_price), 0) AS sale_value,
              COALESCE(SUM(quantity <= min_stock AND quantity > 0), 0) AS low_stock,
              COALESCE(SUM(quantity = 0), 0) AS out_of_stock
         FROM products WHERE is_active = 1`
    );
    res.json(summary);
  })
);

/**
 * Nouveau mouvement manuel (entrée, sortie, ajustement).
 * Tout se passe dans une transaction : verrou produit, contrôle du stock,
 * mise à jour de la quantité, historique et journal.
 */
router.post(
  '/movements',
  validate(movementSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (b.type === 'ADJUSTMENT' && req.user.role !== 'admin') {
      throw new AppError(403, 'Les ajustements de stock sont réservés aux administrateurs');
    }
    if (b.supplier_id) {
      const [sup] = await query('SELECT id FROM suppliers WHERE id = ?', [b.supplier_id]);
      if (!sup) throw new AppError(400, 'Fournisseur introuvable');
    }
    const movement = await withTransaction((conn) =>
      stock.applyMovement(conn, {
        productId: b.product_id,
        type: b.type,
        quantity: b.quantity,
        newQuantity: b.new_quantity,
        unitCost: b.type === 'IN' ? b.unit_cost : undefined,
        supplierId: b.type === 'IN' ? b.supplier_id : null,
        reference: b.reference,
        notes: b.notes,
        idempotencyKey: b.idempotency_key,
        userId: req.user.id,
      })
    );
    res.status(201).json(movement);
  })
);

module.exports = router;
module.exports.movementFilters = movementFilters;
module.exports.MOVEMENT_SELECT = MOVEMENT_SELECT;
