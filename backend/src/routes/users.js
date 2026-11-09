const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authorize } = require('../middleware/auth');
const { z, validate, reqStr, optEmail } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../utils/helpers');

// Gestion des utilisateurs : réservée aux administrateurs
router.use(authorize('admin'));

const FIELDS = 'id, username, full_name, email, role, is_active, last_login_at, created_at';

const base = {
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Lettres, chiffres, point, tiret uniquement'),
  full_name: reqStr(120),
  email: optEmail(),
  role: z.enum(['admin', 'employee']),
  is_active: z.coerce.boolean().default(true),
};

async function ensureAnotherAdmin(excludedId) {
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?", [excludedId]);
  if (n === 0) throw new AppError(409, 'Il doit rester au moins un administrateur actif');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await query(`SELECT ${FIELDS} FROM users ORDER BY full_name`));
  })
);

router.post(
  '/',
  validate(z.object({ ...base, password: z.string().min(8).max(100) })),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const [dup] = await query('SELECT id FROM users WHERE username = ?', [b.username]);
    if (dup) throw new AppError(409, "Ce nom d'utilisateur est déjà utilisé");
    const result = await query('INSERT INTO users (username, full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)', [
      b.username,
      b.full_name,
      b.email,
      await bcrypt.hash(b.password, 10),
      b.role,
      b.is_active ? 1 : 0,
    ]);
    const [user] = await query(`SELECT ${FIELDS} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json(user);
  })
);

router.put(
  '/:id',
  validate(z.object({ ...base, password: z.union([z.literal(''), z.string().min(8).max(100)]).optional() })),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    const [user] = await query('SELECT id, role, is_active FROM users WHERE id = ?', [id]);
    if (!user) throw new AppError(404, 'Utilisateur introuvable');

    const [dup] = await query('SELECT id FROM users WHERE username = ? AND id <> ?', [b.username, id]);
    if (dup) throw new AppError(409, "Ce nom d'utilisateur est déjà utilisé");

    if (id === req.user.id && (b.role !== 'admin' || !b.is_active)) {
      throw new AppError(409, 'Vous ne pouvez pas retirer vos propres droits ni désactiver votre compte');
    }
    if (user.role === 'admin' && (b.role !== 'admin' || !b.is_active)) await ensureAnotherAdmin(id);

    await query('UPDATE users SET username = ?, full_name = ?, email = ?, role = ?, is_active = ? WHERE id = ?', [
      b.username,
      b.full_name,
      b.email,
      b.role,
      b.is_active ? 1 : 0,
      id,
    ]);
    if (b.password) await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(b.password, 10), id]);

    const [updated] = await query(`SELECT ${FIELDS} FROM users WHERE id = ?`, [id]);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new AppError(409, 'Vous ne pouvez pas supprimer votre propre compte');
    const [user] = await query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!user) throw new AppError(404, 'Utilisateur introuvable');
    if (user.role === 'admin') await ensureAnotherAdmin(id);

    try {
      await query('DELETE FROM users WHERE id = ?', [id]);
      res.json({ message: 'Utilisateur supprimé', deleted: true });
    } catch (err) {
      if (err.code !== 'ER_ROW_IS_REFERENCED_2') throw err;
      // L'utilisateur a déjà saisi des opérations : on conserve l'historique et on désactive le compte
      await query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
      res.json({ message: 'Compte désactivé (cet utilisateur a un historique d’opérations)', deleted: false });
    }
  })
);

module.exports = router;
