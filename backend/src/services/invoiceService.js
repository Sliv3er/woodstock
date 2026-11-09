const { AppError, r3, today } = require('../utils/helpers');
const { fmtQty, UNITS_SHORT, amountInWords } = require('../utils/labels');
const stock = require('./stockService');
const journal = require('./journalService');
const settings = require('./settingsService');

/** Prochain numéro d'une séquence annuelle (verrou de ligne → pas de doublon ni de trou). */
async function nextNumber(conn, name, prefix, year) {
  await conn.query('INSERT IGNORE INTO sequences (name, year, last_value) VALUES (?, ?, 0)', [name, year]);
  const [[seq]] = await conn.query('SELECT last_value FROM sequences WHERE name = ? AND year = ? FOR UPDATE', [name, year]);
  const value = seq.last_value + 1;
  await conn.query('UPDATE sequences SET last_value = ? WHERE name = ? AND year = ?', [value, name, year]);
  return `${prefix}-${year}-${String(value).padStart(4, '0')}`;
}

/** Calcule tous les montants d'une facture à partir de ses lignes. */
function computeTotals(items, discountPercent, vatRate, stampDuty) {
  const subtotal = r3(items.reduce((s, it) => s + it.line_total, 0));
  const discount_amount = r3((subtotal * discountPercent) / 100);
  const total_ht = r3(subtotal - discount_amount);
  const vat_amount = r3((total_ht * vatRate) / 100);
  const total_ttc = r3(total_ht + vat_amount + stampDuty);
  return { subtotal, discount_amount, total_ht, vat_amount, total_ttc };
}

/** Complète les lignes saisies avec les données produit (désignation, unité, prix par défaut). */
async function buildItems(conn, items) {
  const ids = items.map((i) => i.product_id);
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'Un même produit ne peut figurer qu’une seule fois sur une facture : regroupez les quantités');
  }
  const [products] = await conn.query('SELECT id, name, unit, selling_price, is_active FROM products WHERE id IN (?)', [ids]);
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((it) => {
    const p = byId.get(it.product_id);
    if (!p) throw new AppError(400, `Produit introuvable (id ${it.product_id})`);
    if (!p.is_active) throw new AppError(400, `Le produit « ${p.name} » est archivé et ne peut plus être facturé`);
    const unit_price = it.unit_price != null ? r3(it.unit_price) : p.selling_price;
    const discount_percent = it.discount_percent || 0;
    return {
      product_id: p.id,
      description: it.description || p.name,
      unit: p.unit,
      quantity: r3(it.quantity),
      unit_price,
      discount_percent,
      line_total: r3(it.quantity * unit_price * (1 - discount_percent / 100)),
    };
  });
}

async function resolveHeader(conn, data) {
  const [[customer]] = await conn.query('SELECT id FROM customers WHERE id = ?', [data.customer_id]);
  if (!customer) throw new AppError(400, 'Client introuvable');

  const [[vat]] = await conn.query('SELECT rate FROM vat_rates WHERE rate = ? AND is_active = 1', [data.vat_rate]);
  if (!vat) throw new AppError(400, `Le taux de TVA ${data.vat_rate} % n'est pas configuré dans les paramètres`);

  let stampDuty = data.stamp_duty;
  if (stampDuty == null) stampDuty = (await settings.getAll(conn)).stamp_duty;
  return { vatRate: vat.rate, stampDuty: r3(stampDuty) };
}

async function insertItems(conn, invoiceId, items) {
  const rows = items.map((it) => [invoiceId, it.product_id, it.description, it.unit, it.quantity, it.unit_price, it.discount_percent, it.line_total]);
  await conn.query(
    'INSERT INTO invoice_items (invoice_id, product_id, description, unit, quantity, unit_price, discount_percent, line_total) VALUES ?',
    [rows]
  );
}

async function lockInvoice(conn, id) {
  const [[invoice]] = await conn.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [id]);
  if (!invoice) throw new AppError(404, 'Facture introuvable');
  return invoice;
}

/** Crée une facture à l'état brouillon (aucun effet sur le stock). */
async function createDraft(conn, data, userId, { at } = {}) {
  const { vatRate, stampDuty } = await resolveHeader(conn, data);
  const items = await buildItems(conn, data.items);
  const discountPercent = data.discount_percent || 0;
  const totals = computeTotals(items, discountPercent, vatRate, stampDuty);
  const invoiceDate = data.invoice_date || today();
  const number = await nextNumber(conn, 'draft', 'BRO', Number(invoiceDate.slice(0, 4)));

  const row = {
    invoice_number: number,
    invoice_date: invoiceDate,
    due_date: data.due_date || null,
    customer_id: data.customer_id,
    status: 'draft',
    payment_status: 'unpaid',
    discount_percent: discountPercent,
    vat_rate: vatRate,
    stamp_duty: stampDuty,
    notes: data.notes || null,
    created_by: userId,
    ...totals,
  };
  if (at) row.created_at = at;
  const [res] = await conn.query('INSERT INTO invoices SET ?', [row]);
  await insertItems(conn, res.insertId, items);
  return res.insertId;
}

/** Modifie un brouillon : les lignes sont remplacées et les totaux recalculés. */
async function updateDraft(conn, id, data) {
  const invoice = await lockInvoice(conn, id);
  if (invoice.status !== 'draft') throw new AppError(409, 'Seule une facture à l’état brouillon peut être modifiée');

  const { vatRate, stampDuty } = await resolveHeader(conn, data);
  const items = await buildItems(conn, data.items);
  const discountPercent = data.discount_percent || 0;
  const totals = computeTotals(items, discountPercent, vatRate, stampDuty);

  await conn.query('UPDATE invoices SET ? WHERE id = ?', [
    {
      invoice_date: data.invoice_date || invoice.invoice_date,
      due_date: data.due_date || null,
      customer_id: data.customer_id,
      discount_percent: discountPercent,
      vat_rate: vatRate,
      stamp_duty: stampDuty,
      notes: data.notes || null,
      ...totals,
    },
    id,
  ]);
  await conn.query('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
  await insertItems(conn, id, items);
}

/**
 * Confirme une facture :
 *  - vérifie la disponibilité de TOUS les articles (liste complète des manquants) ;
 *  - attribue le numéro définitif FAC-AAAA-NNNN ;
 *  - déduit le stock et crée un mouvement OUT par ligne ;
 *  - inscrit la vente au journal.
 * Tout échec annule l'ensemble (transaction).
 */
async function confirm(conn, id, userId, { at } = {}) {
  const invoice = await lockInvoice(conn, id);
  if (invoice.status === 'confirmed') throw new AppError(409, 'Cette facture est déjà confirmée');
  if (invoice.status === 'cancelled') throw new AppError(409, 'Une facture annulée ne peut pas être confirmée');

  // Tri par produit : ordre de verrouillage constant → pas d'interblocage entre deux confirmations
  const [items] = await conn.query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY product_id', [id]);
  if (!items.length) throw new AppError(400, 'La facture ne contient aucun article');

  const [products] = await conn.query('SELECT id, name, unit, quantity FROM products WHERE id IN (?) ORDER BY id FOR UPDATE', [
    items.map((i) => i.product_id),
  ]);
  const stockById = new Map(products.map((p) => [p.id, p]));
  const shortages = items
    .filter((it) => it.quantity > stockById.get(it.product_id).quantity)
    .map((it) => {
      const p = stockById.get(it.product_id);
      return { product_id: p.id, product: p.name, available: p.quantity, requested: it.quantity, unit: UNITS_SHORT[p.unit] };
    });
  if (shortages.length) {
    const list = shortages.map((s) => `${s.product} (disponible ${fmtQty(s.available)} ${s.unit}, demandé ${fmtQty(s.requested)} ${s.unit})`).join(' ; ');
    throw new AppError(409, `Stock insuffisant — ${list}`, shortages);
  }

  const number = await nextNumber(conn, 'invoice', 'FAC', Number(invoice.invoice_date.slice(0, 4)));

  await conn.query(
    "UPDATE invoices SET status = 'confirmed', payment_status = ?, invoice_number = ?, confirmed_at = COALESCE(?, NOW()) WHERE id = ?",
    [invoice.total_ttc === 0 ? 'paid' : 'unpaid', number, at || null, id]
  );

  for (const it of items) {
    await stock.applyMovement(conn, {
      productId: it.product_id,
      type: 'OUT',
      quantity: it.quantity,
      source: 'invoice',
      reference: number,
      invoiceId: id,
      notes: `Vente — facture ${number}`,
      userId,
      at,
    });
  }

  const [[customer]] = await conn.query('SELECT name FROM customers WHERE id = ?', [invoice.customer_id]);
  await journal.addEntry(conn, {
    type: 'sale',
    amount: invoice.total_ttc,
    reference: number,
    description: `Facture ${number} — ${customer.name}`,
    invoiceId: id,
    customerId: invoice.customer_id,
    userId,
    at,
  });

  return number;
}

/**
 * Annule une facture.
 *  - Brouillon : simple changement d'état.
 *  - Confirmée : ré-intègre le stock (un mouvement IN « invoice_cancel » par ligne).
 * Le verrou sur la facture + la contrainte unique (invoice_id, product_id, source)
 * garantissent qu'une double annulation ne crée jamais de mouvements en double.
 */
async function cancel(conn, id, userId, reason, { at } = {}) {
  const invoice = await lockInvoice(conn, id);
  if (invoice.status === 'cancelled') throw new AppError(409, 'Cette facture est déjà annulée');

  if (invoice.status === 'confirmed') {
    if (invoice.amount_paid > 0) {
      throw new AppError(
        409,
        'Cette facture a des paiements enregistrés. Supprimez d’abord les paiements (remboursement) avant de l’annuler.'
      );
    }
    const [items] = await conn.query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY product_id', [id]);
    for (const it of items) {
      await stock.applyMovement(conn, {
        productId: it.product_id,
        type: 'IN',
        quantity: it.quantity,
        source: 'invoice_cancel',
        reference: invoice.invoice_number,
        invoiceId: id,
        notes: `Annulation de la facture ${invoice.invoice_number}`,
        userId,
        at,
      });
    }
    const [[customer]] = await conn.query('SELECT name FROM customers WHERE id = ?', [invoice.customer_id]);
    await journal.addEntry(conn, {
      type: 'sale_cancel',
      amount: -invoice.total_ttc,
      reference: invoice.invoice_number,
      description: `Annulation de la facture ${invoice.invoice_number} — ${customer.name}`,
      invoiceId: id,
      customerId: invoice.customer_id,
      userId,
      at,
    });
  }

  await conn.query(
    "UPDATE invoices SET status = 'cancelled', payment_status = 'cancelled', cancel_reason = ?, cancelled_at = COALESCE(?, NOW()) WHERE id = ?",
    [reason || null, at || null, id]
  );
}

const paymentStatusFor = (paid, total) => (paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial');

/** Enregistre un paiement client et met à jour l'état de règlement de la facture. */
async function addPayment(conn, data, userId, { at } = {}) {
  const invoice = await lockInvoice(conn, data.invoice_id);
  if (invoice.status !== 'confirmed') throw new AppError(409, 'Un paiement ne peut être enregistré que sur une facture confirmée');

  const amount = r3(data.amount);
  const remaining = r3(invoice.total_ttc - invoice.amount_paid);
  if (remaining <= 0) throw new AppError(409, 'Cette facture est déjà entièrement payée');
  if (amount > remaining) {
    throw new AppError(400, `Le montant dépasse le reste à payer (${remaining.toFixed(3)} DT)`);
  }

  const row = {
    invoice_id: invoice.id,
    customer_id: invoice.customer_id,
    payment_date: data.payment_date || today(),
    amount,
    method: data.method,
    reference: data.reference || null,
    notes: data.notes || null,
    created_by: userId,
  };
  if (at) row.created_at = at;
  const [res] = await conn.query('INSERT INTO payments SET ?', [row]);

  const paid = r3(invoice.amount_paid + amount);
  await conn.query('UPDATE invoices SET amount_paid = ?, payment_status = ? WHERE id = ?', [paid, paymentStatusFor(paid, invoice.total_ttc), invoice.id]);

  const [[customer]] = await conn.query('SELECT name FROM customers WHERE id = ?', [invoice.customer_id]);
  await journal.addEntry(conn, {
    type: 'payment',
    amount,
    reference: data.reference || invoice.invoice_number,
    description: `Paiement facture ${invoice.invoice_number} — ${customer.name}`,
    invoiceId: invoice.id,
    paymentId: res.insertId,
    customerId: invoice.customer_id,
    userId,
    at: at || `${row.payment_date} ${new Date().toTimeString().slice(0, 8)}`,
  });

  return res.insertId;
}

/** Supprime un paiement saisi par erreur (son écriture de journal est supprimée en cascade). */
async function deletePayment(conn, paymentId) {
  const [[payment]] = await conn.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment) throw new AppError(404, 'Paiement introuvable');
  const invoice = await lockInvoice(conn, payment.invoice_id);

  await conn.query('DELETE FROM payments WHERE id = ?', [paymentId]);
  const [[{ paid }]] = await conn.query('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?', [invoice.id]);
  const status = invoice.status === 'cancelled' ? 'cancelled' : paymentStatusFor(paid, invoice.total_ttc);
  await conn.query('UPDATE invoices SET amount_paid = ?, payment_status = ? WHERE id = ?', [r3(paid), status, invoice.id]);
}

/** Facture complète : en-tête, client, lignes et paiements. */
async function getFull(runner, id) {
  const [[invoice]] = await runner.query(
    `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
            c.address AS customer_address, c.tax_id AS customer_tax_id, u.full_name AS created_by_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN users u ON u.id = i.created_by
      WHERE i.id = ?`,
    [id]
  );
  if (!invoice) throw new AppError(404, 'Facture introuvable');
  const [items] = await runner.query(
    `SELECT ii.*, p.sku, p.quantity AS stock_quantity
       FROM invoice_items ii JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ? ORDER BY ii.id`,
    [id]
  );
  const [payments] = await runner.query(
    `SELECT p.*, u.full_name AS created_by_name
       FROM payments p JOIN users u ON u.id = p.created_by
      WHERE p.invoice_id = ? ORDER BY p.payment_date, p.id`,
    [id]
  );
  invoice.balance = r3(invoice.total_ttc - invoice.amount_paid);
  invoice.amount_in_words = amountInWords(invoice.total_ttc);
  return { ...invoice, items, payments };
}

module.exports = { computeTotals, createDraft, updateDraft, confirm, cancel, addPayment, deletePayment, getFull };
