const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { z, validate, reqStr } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../utils/helpers');

// Limite les tentatives de connexion (protection contre la force brute)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' },
});

const publicUser = (u) => ({ id: u.id, username: u.username, full_name: u.full_name, email: u.email, role: u.role });

router.post(
  '/login',
  loginLimiter,
  validate(z.object({ username: reqStr(50), password: reqStr(100) })),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const [user] = await query('SELECT * FROM users WHERE username = ?', [username]);
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!ok) throw new AppError(401, "Nom d'utilisateur ou mot de passe incorrect");

    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    res.json({ token, user: publicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.put(
  '/password',
  authenticate,
  validate(z.object({ current_password: reqStr(100), new_password: z.string().min(8).max(100) })),
  asyncHandler(async (req, res) => {
    const [user] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(req.body.current_password, user.password_hash))) {
      throw new AppError(400, 'Le mot de passe actuel est incorrect');
    }
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(req.body.new_password, 10), req.user.id]);
    res.json({ message: 'Mot de passe modifié' });
  })
);

module.exports = router;
