/** Erreur métier renvoyée au client avec un code HTTP et un message en français. */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Permet d'utiliser async/await dans les routes Express sans try/catch. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Arrondi à 3 décimales (millimes). */
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** Pagination à partir de la query string. */
function paginate(q, { defaultLimit = 20, maxLimit = 1000 } = {}) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || defaultLimit, 1), maxLimit);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

/** Tri sécurisé : seules les colonnes de la liste blanche sont acceptées. */
function orderBy(q, allowed, fallback) {
  const col = allowed[q.sort] || allowed[fallback];
  const dir = String(q.order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return `${col} ${dir}`;
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Date du jour au format YYYY-MM-DD (heure locale du serveur). */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { AppError, asyncHandler, r3, paginate, orderBy, isDate, today };
