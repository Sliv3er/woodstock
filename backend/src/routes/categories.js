const router = require('express').Router();
const { query } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, reqStr, optStr } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../utils/helpers');

const schema = z.object({ name: reqStr(80), description: optStr(255) });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(
      await query(
        `SELECT c.id, c.name, c.description, COUNT(p.id) AS product_count
           FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
          GROUP BY c.id ORDER BY c.id`
      )
    );
  })
);

router.post(
  '/',
  authorize('admin'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const [dup] = await query('SELECT id FROM categories WHERE name = ?', [req.body.name]);
    if (dup) throw new AppError(409, 'Une catégorie porte déjà ce nom');
    const result = await query('INSERT INTO categories (name, description) VALUES (?, ?)', [req.body.name, req.body.description]);
    res.status(201).json({ id: result.insertId, ...req.body, product_count: 0 });
  })
);

router.put(
  '/:id',
  authorize('admin'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const [dup] = await query('SELECT id FROM categories WHERE name = ? AND id <> ?', [req.body.name, req.params.id]);
    if (dup) throw new AppError(409, 'Une catégorie porte déjà ce nom');
    const result = await query('UPDATE categories SET name = ?, description = ? WHERE id = ?', [req.body.name, req.body.description, req.params.id]);
    if (!result.affectedRows) throw new AppError(404, 'Catégorie introuvable');
    res.json({ id: Number(req.params.id), ...req.body });
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [req.params.id]);
    if (n > 0) throw new AppError(409, `Suppression impossible : ${n} produit(s) appartiennent à cette catégorie`);
    const result = await query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) throw new AppError(404, 'Catégorie introuvable');
    res.json({ message: 'Catégorie supprimée' });
  })
);

module.exports = router;
