const { z } = require('zod');
const { AppError } = require('../utils/helpers');

// Messages de validation en français
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'Champ obligatoire' : 'Valeur invalide' };
    case 'too_small':
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Champ obligatoire' : `Minimum ${issue.minimum} caractères` };
      if (issue.type === 'array') return { message: `Au moins ${issue.minimum} élément(s) requis` };
      return { message: `Doit être ${issue.inclusive ? 'supérieur ou égal à' : 'supérieur à'} ${issue.minimum}` };
    case 'too_big':
      if (issue.type === 'string') return { message: `Maximum ${issue.maximum} caractères` };
      return { message: `Doit être ${issue.inclusive ? 'inférieur ou égal à' : 'inférieur à'} ${issue.maximum}` };
    case 'invalid_enum_value':
      return { message: 'Valeur non autorisée' };
    case 'invalid_string':
      return { message: issue.validation === 'email' ? 'Adresse e-mail invalide' : 'Format invalide' };
    default:
      return { message: ctx.defaultError };
  }
});

/** Valide req.body avec un schéma zod ; remplace le corps par les données nettoyées. */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = details[0];
    return next(new AppError(400, `Données invalides — ${first.field ? `${first.field} : ` : ''}${first.message}`, details));
  }
  req.body = result.data;
  next();
};

// ---- Briques de schéma réutilisables -------------------------------------------
const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

/** Chaîne facultative : '' et undefined deviennent null. */
const optStr = (max = 255) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());
const reqStr = (max = 255) => z.string().trim().min(1).max(max);
const optEmail = () => z.preprocess(emptyToNull, z.string().trim().email().max(160).nullable());
const optId = () => z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable());
const id = () => z.coerce.number().int().positive();
const money = () => z.coerce.number().min(0).max(999999999);
const qty = () => z.coerce.number().positive().max(99999999);
const percent = () => z.coerce.number().min(0).max(100);
const optDate = () => z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').nullable());

module.exports = { z, validate, optStr, reqStr, optEmail, optId, id, money, qty, percent, optDate };
