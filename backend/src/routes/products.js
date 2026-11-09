const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, reqStr, optStr, optId, id, money } = require('../middleware/validate');
const { AppError, asyncHandler, paginate, orderBy } = require('../utils/helpers');
const stock = require('../services/stockService');

const UNITS = ['piece', 'sheet', 'meter', 'roll', 'kilogram', 'liter', 'pack'];

const base = {
  sku: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/, 'Lettres, chiffres, tiret, point uniquement').transform((s) => s.toUpperCase()),
  name: reqStr(160),
  category_id: id(),
  description: optStr(2000),
  unit: z.enum(UNITS),
  purchase_price: money(),
  selling_price: money(),
  min_stock: money(),
  supplier_id: optId(),
};

const SELECT = `
  SELECT p.id, p.sku, p.name, p.category_id, c.name AS category_name, p.description, p.unit,
         p.purchase_price, p.selling_price, p.quantity, p.min_stock, p.supplier_id, s.name AS supplier_name,
         p.is_active, p.created_at, p.updated_at,
         (p.quantity <= p.min_stock) AS is_low_stock
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id`;

const SORTS = {
  name: 'p.name',
  sku: 'p.sku',
  category: 'c.name',
  quantity: 'p.quantity',
  purchase_price: 'p.purchase_price',
  selling_price: 'p.selling_price',
  updated_at: 'p.updated_at',
};

async function checkRefs(b, excludeId = 0) {
  const [dup] = await query('SELECT id FROM products WHERE sku = ? AND id <> ?', [b.sku, excludeId]);
  if (dup) throw new AppError(409, `La référence « ${b.sku} » est déjà utilisée par un autre produit`);
  const [cat] = await query('SELECT id FROM categories WHERE id = ?', [b.category_id]);
  if (!cat) throw new AppError(400, 'Catégorie introuvable');
  if (b.supplier_id) {
    const [sup] = await query('SELECT id FROM suppliers WHERE id = ?', [b.supplier_id]);
    if (!sup) throw new AppError(400, 'Fournisseur introuvable');
  }
}

// Liste : recherche, filtre catégorie / état du stock, tri, pagination
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paginate(req.query);
    const where = [];
    const params = [];

    if (req.query.archived === '1') where.push('p.is_active = 0');
    else where.push('p.is_active = 1');

    if (req.query.search) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
      const like = `%${req.query.search}%`;
      params.push(like, like, like);
    }
    if (req.query.category_id) {
      where.push('p.category_id = ?');
      params.push(req.query.category_id);
    }
    if (req.query.supplier_id) {
      where.push('p.supplier_id = ?');
      params.push(req.query.supplier_id);
    }
    if (req.query.stock === 'low') where.push('p.quantity <= p.min_stock AND p.quantity > 0');
    if (req.query.stock === 'out') where.push('p.quantity = 0');
    if (req.query.stock === 'alert') where.push('p.quantity <= p.min_stock');
    if (req.query.stock === 'ok') where.push('p.quantity > p.min_stock');

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, params);
    const data = await query(`${SELECT} ${whereSql} ORDER BY ${orderBy(req.query, SORTS, 'name')}, p.id LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ data, total, page, limit });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const [product] = await query(`${SELECT} WHERE p.id = ?`, [req.params.id]);
    if (!product) throw new AppError(404, 'Produit introuvable');
    const movements = await query(
      `SELECT m.id, m.type, m.quantity, m.previous_quantity, m.new_quantity, m.source, m.reference, m.notes, m.created_at,
              u.full_name AS user_name
         FROM stock_movements m JOIN users u ON u.id = m.user_id
        WHERE m.product_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 25`,
      [req.params.id]
    );
    const [sales] = await query(
      `SELECT COALESCE(SUM(ii.quantity), 0) AS quantity_sold, COALESCE(SUM(ii.line_total), 0) AS revenue_ht
         FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
        WHERE ii.product_id = ? AND i.status = 'confirmed'`,
      [req.params.id]
    );
    res.json({ ...product, movements, sales });
  })
);

// Création : le stock initial éventuel passe par un mouvement d'entrée (traçabilité)
router.post(
  '/',
  validate(z.object({ ...base, initial_quantity: money().default(0) })),
  asyncHandler(async (req, res) => {
    const b = req.body;
    await checkRefs(b);
    const productId = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO products (sku, name, category_id, description, unit, purchase_price, selling_price, quantity, min_stock, supplier_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [b.sku, b.name, b.category_id, b.description, b.unit, b.purchase_price, b.selling_price, b.min_stock, b.supplier_id]
      );
      if (b.initial_quantity > 0) {
        await stock.applyMovement(conn, {
          productId: result.insertId,
          type: 'IN',
          quantity: b.initial_quantity,
          source: 'initial',
          reference: 'STOCK-INITIAL',
          notes: 'Stock initial à la création du produit',
          userId: req.user.id,
        });
      }
      return result.insertId;
    });
    const [product] = await query(`${SELECT} WHERE p.id = ?`, [productId]);
    res.status(201).json(product);
  })
);

// Modification : la quantité n'est pas modifiable ici (uniquement via les mouvements de stock)
router.put(
  '/:id',
  validate(z.object(base)),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const productId = Number(req.params.id);
    const [existing] = await query('SELECT id FROM products WHERE id = ?', [productId]);
    if (!existing) throw new AppError(404, 'Produit introuvable');
    await checkRefs(b, productId);
    await query(
      `UPDATE products SET sku = ?, name = ?, category_id = ?, description = ?, unit = ?, purchase_price = ?,
              selling_price = ?, min_stock = ?, supplier_id = ? WHERE id = ?`,
      [b.sku, b.name, b.category_id, b.description, b.unit, b.purchase_price, b.selling_price, b.min_stock, b.supplier_id, productId]
    );
    const [product] = await query(`${SELECT} WHERE p.id = ?`, [productId]);
    res.json(product);
  })
);

// Restauration d'un produit archivé
router.post(
  '/:id/restore',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const result = await query('UPDATE products SET is_active = 1 WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) throw new AppError(404, 'Produit introuvable');
    res.json({ message: 'Produit restauré' });
  })
);

/**
 * Suppression avec garde-fous :
 *  - refusée tant qu'il reste du stock ou que le produit figure sur un brouillon ;
 *  - produit déjà utilisé (mouvements, factures) → archivé pour préserver l'historique ;
 *  - produit jamais utilisé → supprimé définitivement.
 */
router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const outcome = await withTransaction(async (conn) => {
      const [[product]] = await conn.query('SELECT id, name, quantity FROM products WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!product) throw new AppError(404, 'Produit introuvable');
      if (product.quantity > 0) {
        throw new AppError(409, `Suppression impossible : il reste ${product.quantity} en stock. Sortez ou ajustez le stock à zéro d'abord.`);
      }
      const [[{ drafts }]] = await conn.query(
        "SELECT COUNT(*) AS drafts FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ii.product_id = ? AND i.status = 'draft'",
        [product.id]
      );
      if (drafts > 0) throw new AppError(409, 'Suppression impossible : ce produit figure sur une facture en brouillon');

      const [[{ used }]] = await conn.query(
        `SELECT (SELECT COUNT(*) FROM stock_movements WHERE product_id = ?) + (SELECT COUNT(*) FROM invoice_items WHERE product_id = ?) AS used`,
        [product.id, product.id]
      );
      if (used > 0) {
        await conn.query('UPDATE products SET is_active = 0 WHERE id = ?', [product.id]);
        return { deleted: false, message: `« ${product.name} » a été archivé (son historique est conservé)` };
      }
      await conn.query('DELETE FROM products WHERE id = ?', [product.id]);
      return { deleted: true, message: `« ${product.name} » a été supprimé` };
    });
    res.json(outcome);
  })
);

module.exports = router;
