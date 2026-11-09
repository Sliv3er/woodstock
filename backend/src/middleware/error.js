const { AppError } = require('../utils/helpers');

const notFound = (req, res, next) => next(new AppError(404, `Route introuvable : ${req.method} ${req.originalUrl}`));

// Traduit les erreurs MySQL courantes en réponses lisibles.
function fromMysql(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return new AppError(409, 'Cet enregistrement existe déjà (valeur en double)');
    case 'ER_ROW_IS_REFERENCED_2':
      return new AppError(409, 'Suppression impossible : cet élément est utilisé par d’autres enregistrements');
    case 'ER_NO_REFERENCED_ROW_2':
      return new AppError(400, 'Référence invalide vers un enregistrement inexistant');
    case 'ER_CONSTRAINT_FAILED':
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return new AppError(400, 'Opération refusée : une contrainte d’intégrité n’est pas respectée');
    case 'ER_LOCK_DEADLOCK':
    case 'ER_LOCK_WAIT_TIMEOUT':
      return new AppError(409, 'Opération concurrente en cours, veuillez réessayer');
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
      return new AppError(503, 'Base de données indisponible');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err instanceof AppError ? err : fromMysql(err);
  if (!error && err.type === 'entity.parse.failed') error = new AppError(400, 'Corps de requête JSON invalide');
  if (!error) {
    console.error('[ERREUR]', err);
    error = new AppError(500, 'Erreur interne du serveur');
  }
  res.status(error.status).json({ message: error.message, details: error.details });
};

module.exports = { notFound, errorHandler };
