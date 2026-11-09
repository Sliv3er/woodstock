const { AppError, r3 } = require('../utils/helpers');
const { fmtQty, UNITS_SHORT } = require('../utils/labels');
const journal = require('./journalService');

/**
 * Enregistre un mouvement de stock et met à jour la quantité du produit.
 *
 * DOIT être appelé dans une transaction (`conn` issu de withTransaction) :
 *  1. la ligne produit est verrouillée (SELECT … FOR UPDATE) ;
 *  2. la nouvelle quantité est calculée et contrôlée (jamais négative) ;
 *  3. le produit, le mouvement et l'écriture de journal sont écrits ensemble.
 *
 * @param {object} m
 *   productId, type ('IN' | 'OUT' | 'ADJUSTMENT'), userId
 *   quantity      quantité déplacée (IN / OUT)
 *   newQuantity   quantité réelle constatée (ADJUSTMENT)
 *   unitCost      coût d'achat unitaire (IN fournisseur) — met à jour le prix d'achat
 *   source        'manual' | 'initial' | 'invoice' | 'invoice_cancel'
 *   reference, notes, invoiceId, supplierId, idempotencyKey, at (date forcée, données de démo)
 */
async function applyMovement(conn, m) {
  const [rows] = await conn.query(
    'SELECT id, sku, name, unit, quantity, purchase_price, is_active FROM products WHERE id = ? FOR UPDATE',
    [m.productId]
  );
  const product = rows[0];
  if (!product) throw new AppError(404, 'Produit introuvable');

  const source = m.source || 'manual';
  if (!product.is_active && source === 'manual') {
    throw new AppError(409, `Le produit « ${product.name} » est archivé`);
  }

  const previous = r3(product.quantity);
  const unit = UNITS_SHORT[product.unit] || '';
  let quantity;
  let next;

  if (m.type === 'IN') {
    quantity = r3(m.quantity);
    next = r3(previous + quantity);
  } else if (m.type === 'OUT') {
    quantity = r3(m.quantity);
    if (quantity > previous) {
      throw new AppError(
        409,
        `Stock insuffisant pour « ${product.name} » : disponible ${fmtQty(previous)} ${unit}, demandé ${fmtQty(quantity)} ${unit}`
      );
    }
    next = r3(previous - quantity);
  } else if (m.type === 'ADJUSTMENT') {
    next = r3(m.newQuantity);
    if (!(next >= 0)) throw new AppError(400, 'La quantité ajustée ne peut pas être négative');
    quantity = r3(Math.abs(next - previous));
    if (quantity === 0) throw new AppError(400, 'Aucun écart : la quantité saisie est identique au stock actuel');
  } else {
    throw new AppError(400, 'Type de mouvement invalide');
  }
  if (!(quantity > 0)) throw new AppError(400, 'La quantité doit être supérieure à zéro');

  const unitCost = m.unitCost != null ? r3(m.unitCost) : r3(product.purchase_price);

  // Mise à jour du stock (et du dernier prix d'achat lors d'une réception fournisseur)
  if (m.type === 'IN' && m.unitCost != null && source === 'manual') {
    await conn.query('UPDATE products SET quantity = ?, purchase_price = ? WHERE id = ?', [next, unitCost, product.id]);
  } else {
    await conn.query('UPDATE products SET quantity = ? WHERE id = ?', [next, product.id]);
  }

  const row = {
    product_id: product.id,
    type: m.type,
    quantity,
    previous_quantity: previous,
    new_quantity: next,
    unit_cost: unitCost,
    source,
    reference: m.reference || null,
    invoice_id: m.invoiceId || null,
    supplier_id: m.supplierId || null,
    notes: m.notes || null,
    user_id: m.userId,
    idempotency_key: m.idempotencyKey || null,
  };
  if (m.at) row.created_at = m.at;

  let movementId;
  try {
    const [res] = await conn.query('INSERT INTO stock_movements SET ?', [row]);
    movementId = res.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'Ce mouvement a déjà été enregistré (doublon détecté)');
    }
    throw err;
  }

  // Écriture de journal correspondante (valorisée au coût)
  const value = r3(quantity * unitCost);
  const sign = next >= previous ? 1 : -1;
  const label = `${fmtQty(quantity)} ${unit} — ${product.name}`;
  let type;
  let description;
  if (m.type === 'IN') {
    const isPurchase = Boolean(m.supplierId) && source !== 'invoice_cancel';
    type = isPurchase ? 'purchase' : 'stock_in';
    description =
      source === 'invoice_cancel' ? `Retour en stock (annulation) : ${label}` : isPurchase ? `Achat : ${label}` : `Entrée de stock : ${label}`;
  } else if (m.type === 'OUT') {
    type = 'stock_out';
    description = source === 'invoice' ? `Sortie (vente) : ${label}` : `Sortie de stock : ${label}`;
  } else {
    type = 'adjustment';
    description = `Ajustement d'inventaire : ${product.name} (${fmtQty(previous)} → ${fmtQty(next)} ${unit})`;
  }

  await journal.addEntry(conn, {
    type,
    amount: r3(sign * value),
    reference: m.reference,
    description,
    movementId,
    productId: product.id,
    invoiceId: m.invoiceId,
    supplierId: m.supplierId,
    userId: m.userId,
    at: m.at,
  });

  return { id: movementId, product_id: product.id, product_name: product.name, type: m.type, quantity, previous_quantity: previous, new_quantity: next };
}

module.exports = { applyMovement };
