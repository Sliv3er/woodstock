const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/helpers');

/** Vérifie le jeton JWT et charge l'utilisateur (compte actif obligatoire). */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Authentification requise');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(401, 'Session expirée ou invalide, veuillez vous reconnecter');
  }

  const [user] = await query('SELECT id, username, full_name, email, role, is_active FROM users WHERE id = ?', [payload.sub]);
  if (!user || !user.is_active) throw new AppError(401, 'Compte désactivé ou introuvable');

  req.user = user;
  next();
});

/** Restreint une route à certains rôles : authorize('admin'). */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, "Vous n'avez pas les droits nécessaires pour cette action"));
  }
  next();
};

module.exports = { authenticate, authorize };
