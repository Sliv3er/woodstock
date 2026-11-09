const { query } = require('../config/db');
const { AppError, isDate, r3 } = require('../utils/helpers');
const L = require('../utils/labels');
const { invoiceFilters } = require('../routes/invoices');
const { movementFilters, MOVEMENT_SELECT } = require('../routes/stock');
const { paymentFilters, PAYMENT_FROM } = require('../routes/payments');
const { transactionFilters } = require('../routes/transactions');

const MAX_ROWS = 5000;

function periodLabel(q) {
  if (isDate(q.from) && isDate(q.to)) return `Période du ${L.fmtDate(q.from)} au ${L.fmtDate(q.to)}`;
  if (isDate(q.from)) return `À partir du ${L.fmtDate(q.from)}`;
  if (isDate(q.to)) return `Jusqu'au ${L.fmtDate(q.to)}`;
  return 'Toutes les périodes';
}

const sum = (rows, key) => r3(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));

const stockState = (p) => (p.quantity === 0 ? 'Rupture' : p.quantity <= p.min_stock ? 'Stock faible' : 'Disponible');

/**
 * Chaque rapport renvoie la même structure, consommée par l'aperçu à l'écran,
 * l'export Excel et l'export PDF :
 *   { title, subtitle, columns: [{ key, label, type, width }], rows, totals, summary }
 */
const REPORTS = {
  // Journal des ventes : factures confirmées de la période
  async sales(q) {
    const { whereSql, params } = invoiceFilters({ ...q, status: 'confirmed' });
    const rows = await query(
      `SELECT i.invoice_number, i.invoice_date, c.name AS customer_name, i.total_ht, i.vat_amount, i.stamp_duty, i.total_ttc,
              i.amount_paid, (i.total_ttc - i.amount_paid) AS balance, i.payment_status
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         ${whereSql} ORDER BY i.invoice_date, i.id LIMIT ${MAX_ROWS}`,
      params
    );
    rows.forEach((r) => (r.payment_label = L.PAYMENT_STATUS[r.payment_status]));
    return {
      title: 'Journal des ventes',
      subtitle: periodLabel(q),
      columns: [
        { key: 'invoice_number', label: 'N° facture', width: 13 },
        { key: 'invoice_date', label: 'Date', type: 'date', width: 9 },
        { key: 'customer_name', label: 'Client', width: 24 },
        { key: 'total_ht', label: 'Total HT', type: 'money', width: 11 },
        { key: 'vat_amount', label: 'TVA', type: 'money', width: 10 },
        { key: 'stamp_duty', label: 'Timbre', type: 'money', width: 7 },
        { key: 'total_ttc', label: 'Total TTC', type: 'money', width: 11 },
        { key: 'amount_paid', label: 'Réglé', type: 'money', width: 11 },
        { key: 'balance', label: 'Reste dû', type: 'money', width: 11 },
        { key: 'payment_label', label: 'Règlement', width: 15 },
      ],
      rows,
      totals: {
        total_ht: sum(rows, 'total_ht'),
        vat_amount: sum(rows, 'vat_amount'),
        stamp_duty: sum(rows, 'stamp_duty'),
        total_ttc: sum(rows, 'total_ttc'),
        amount_paid: sum(rows, 'amount_paid'),
        balance: sum(rows, 'balance'),
      },
      summary: [
        { label: 'Factures', value: rows.length, type: 'int' },
        { label: "Chiffre d'affaires TTC", value: sum(rows, 'total_ttc'), type: 'money' },
        { label: 'Encaissé', value: sum(rows, 'amount_paid'), type: 'money' },
        { label: 'Reste à encaisser', value: sum(rows, 'balance'), type: 'money' },
      ],
    };
  },

  // Créances clients : factures confirmées non soldées
  async receivables(q) {
    const { whereSql, params } = invoiceFilters({ ...q, payment_status: 'due' });
    const rows = await query(
      `SELECT i.invoice_number, i.invoice_date, i.due_date, c.name AS customer_name, c.phone, i.total_ttc, i.amount_paid,
              (i.total_ttc - i.amount_paid) AS balance, GREATEST(DATEDIFF(CURDATE(), COALESCE(i.due_date, i.invoice_date)), 0) AS days_late
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         ${whereSql} ORDER BY days_late DESC, i.invoice_date LIMIT ${MAX_ROWS}`,
      params
    );
    return {
      title: 'Créances clients',
      subtitle: periodLabel(q),
      columns: [
        { key: 'invoice_number', label: 'N° facture', width: 13 },
        { key: 'invoice_date', label: 'Date', type: 'date', width: 9 },
        { key: 'due_date', label: 'Échéance', type: 'date', width: 9 },
        { key: 'customer_name', label: 'Client', width: 24 },
        { key: 'phone', label: 'Téléphone', width: 13 },
        { key: 'total_ttc', label: 'Total TTC', type: 'money', width: 11 },
        { key: 'amount_paid', label: 'Réglé', type: 'money', width: 11 },
        { key: 'balance', label: 'Reste dû', type: 'money', width: 11 },
        { key: 'days_late', label: 'Retard (j)', type: 'int', width: 8 },
      ],
      rows,
      totals: { total_ttc: sum(rows, 'total_ttc'), amount_paid: sum(rows, 'amount_paid'), balance: sum(rows, 'balance') },
      summary: [
        { label: 'Factures non soldées', value: rows.length, type: 'int' },
        { label: 'Total des créances', value: sum(rows, 'balance'), type: 'money' },
      ],
    };
  },

  // État du stock valorisé au prix d'achat
  async stock(q) {
    const where = ['p.is_active = 1'];
    const params = [];
    if (q.category_id) {
      where.push('p.category_id = ?');
      params.push(q.category_id);
    }
    if (q.stock === 'alert') where.push('p.quantity <= p.min_stock');
    const rows = await query(
      `SELECT p.sku, p.name, c.name AS category_name, p.unit, p.quantity, p.min_stock, p.purchase_price, p.selling_price,
              (p.quantity * p.purchase_price) AS stock_value
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')} ORDER BY c.id, p.name`,
      params
    );
    rows.forEach((r) => {
      r.unit_label = L.UNITS[r.unit];
      r.state = stockState(r);
    });
    return {
      title: q.stock === 'alert' ? 'Produits à réapprovisionner' : 'État du stock',
      subtitle: `Situation au ${L.fmtDate(new Date().toISOString().slice(0, 10))}`,
      columns: [
        { key: 'sku', label: 'Référence', width: 13 },
        { key: 'name', label: 'Désignation', width: 30 },
        { key: 'category_name', label: 'Catégorie', width: 14 },
        { key: 'unit_label', label: 'Unité', width: 9 },
        { key: 'quantity', label: 'Quantité', type: 'qty', width: 9 },
        { key: 'min_stock', label: 'Seuil min.', type: 'qty', width: 9 },
        { key: 'purchase_price', label: "Prix d'achat", type: 'money', width: 10 },
        { key: 'selling_price', label: 'Prix de vente', type: 'money', width: 10 },
        { key: 'stock_value', label: 'Valeur du stock', type: 'money', width: 12 },
        { key: 'state', label: 'État', width: 10 },
      ],
      rows,
      totals: { stock_value: sum(rows, 'stock_value') },
      summary: [
        { label: 'Produits', value: rows.length, type: 'int' },
        { label: 'Valeur du stock (coût)', value: sum(rows, 'stock_value'), type: 'money' },
        { label: 'Stock faible ou rupture', value: rows.filter((r) => r.quantity <= r.min_stock).length, type: 'int' },
      ],
    };
  },

  // Historique des mouvements de stock
  async movements(q) {
    const { whereSql, params } = movementFilters(q);
    const rows = await query(`${MOVEMENT_SELECT} ${whereSql} ORDER BY m.created_at, m.id LIMIT ${MAX_ROWS}`, params);
    rows.forEach((r) => {
      r.type_label = L.MOVEMENT_TYPES[r.type];
      r.value = r3(r.quantity * (r.unit_cost || 0));
    });
    return {
      title: 'Mouvements de stock',
      subtitle: periodLabel(q),
      columns: [
        { key: 'created_at', label: 'Date', type: 'datetime', width: 12 },
        { key: 'type_label', label: 'Type', width: 9 },
        { key: 'sku', label: 'Référence', width: 12 },
        { key: 'product_name', label: 'Produit', width: 26 },
        { key: 'quantity', label: 'Quantité', type: 'qty', width: 8 },
        { key: 'previous_quantity', label: 'Stock avant', type: 'qty', width: 9 },
        { key: 'new_quantity', label: 'Stock après', type: 'qty', width: 9 },
        { key: 'value', label: 'Valeur (coût)', type: 'money', width: 10 },
        { key: 'reference', label: 'Document', width: 12 },
        { key: 'user_name', label: 'Utilisateur', width: 12 },
      ],
      rows,
      totals: {},
      summary: [
        { label: 'Mouvements', value: rows.length, type: 'int' },
        { label: 'Entrées', value: rows.filter((r) => r.type === 'IN').length, type: 'int' },
        { label: 'Sorties', value: rows.filter((r) => r.type === 'OUT').length, type: 'int' },
        { label: 'Ajustements', value: rows.filter((r) => r.type === 'ADJUSTMENT').length, type: 'int' },
      ],
    };
  },

  // Encaissements
  async payments(q) {
    const { whereSql, params } = paymentFilters(q);
    const rows = await query(
      `SELECT p.payment_date, i.invoice_number, c.name AS customer_name, p.method, p.reference, p.amount, u.full_name AS user_name
         ${PAYMENT_FROM} ${whereSql} ORDER BY p.payment_date, p.id LIMIT ${MAX_ROWS}`,
      params
    );
    rows.forEach((r) => (r.method_label = L.PAYMENT_METHODS[r.method]));
    const byMethod = Object.keys(L.PAYMENT_METHODS)
      .map((m) => ({ label: L.PAYMENT_METHODS[m], value: sum(rows.filter((r) => r.method === m), 'amount'), type: 'money' }))
      .filter((s) => s.value > 0);
    return {
      title: 'Paiements clients',
      subtitle: periodLabel(q),
      columns: [
        { key: 'payment_date', label: 'Date', type: 'date', width: 9 },
        { key: 'invoice_number', label: 'Facture', width: 13 },
        { key: 'customer_name', label: 'Client', width: 26 },
        { key: 'method_label', label: 'Mode de paiement', width: 15 },
        { key: 'reference', label: 'Référence', width: 15 },
        { key: 'user_name', label: 'Saisi par', width: 14 },
        { key: 'amount', label: 'Montant', type: 'money', width: 12 },
      ],
      rows,
      totals: { amount: sum(rows, 'amount') },
      summary: [{ label: 'Total encaissé', value: sum(rows, 'amount'), type: 'money' }, ...byMethod],
    };
  },

  // Journal des transactions quotidiennes
  async transactions(q) {
    const { whereSql, params } = transactionFilters(q);
    const rows = await query(
      `SELECT t.transaction_date, t.type, t.reference, t.description, t.amount, u.full_name AS user_name
         FROM transactions t JOIN users u ON u.id = t.user_id
         ${whereSql} ORDER BY t.transaction_date, t.id LIMIT ${MAX_ROWS}`,
      params
    );
    rows.forEach((r) => (r.type_label = L.TRANSACTION_TYPES[r.type]));
    const of = (...types) => sum(rows.filter((r) => types.includes(r.type)), 'amount');
    return {
      title: 'Journal des transactions',
      subtitle: periodLabel(q),
      columns: [
        { key: 'transaction_date', label: 'Date', type: 'datetime', width: 12 },
        { key: 'type_label', label: 'Catégorie', width: 14 },
        { key: 'reference', label: 'Référence', width: 13 },
        { key: 'description', label: 'Description', width: 40 },
        { key: 'user_name', label: 'Utilisateur', width: 13 },
        { key: 'amount', label: 'Montant (DT)', type: 'money', width: 12 },
      ],
      rows,
      totals: {},
      summary: [
        { label: 'Opérations', value: rows.length, type: 'int' },
        { label: 'Ventes nettes TTC', value: of('sale', 'sale_cancel'), type: 'money' },
        { label: 'Paiements reçus', value: of('payment'), type: 'money' },
        { label: 'Achats fournisseurs', value: of('purchase'), type: 'money' },
      ],
    };
  },

  // Ventes par produit
  async products(q) {
    const where = ["i.status = 'confirmed'"];
    const params = [];
    if (isDate(q.from)) {
      where.push('i.invoice_date >= ?');
      params.push(q.from);
    }
    if (isDate(q.to)) {
      where.push('i.invoice_date <= ?');
      params.push(q.to);
    }
    const rows = await query(
      `SELECT p.sku, p.name, c.name AS category_name, p.unit, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS revenue,
              SUM(ii.quantity * p.purchase_price) AS cost, COUNT(DISTINCT i.id) AS invoices
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         JOIN products p ON p.id = ii.product_id
         JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')}
        GROUP BY p.id, p.sku, p.name, c.name, p.unit ORDER BY revenue DESC`,
      params
    );
    rows.forEach((r) => {
      r.unit_label = L.UNITS[r.unit];
      r.margin = r3(r.revenue - r.cost);
    });
    return {
      title: 'Ventes par produit',
      subtitle: periodLabel(q),
      columns: [
        { key: 'sku', label: 'Référence', width: 13 },
        { key: 'name', label: 'Désignation', width: 30 },
        { key: 'category_name', label: 'Catégorie', width: 14 },
        { key: 'unit_label', label: 'Unité', width: 9 },
        { key: 'invoices', label: 'Factures', type: 'int', width: 7 },
        { key: 'quantity', label: 'Qté vendue', type: 'qty', width: 9 },
        { key: 'revenue', label: 'CA HT', type: 'money', width: 12 },
        { key: 'margin', label: 'Marge brute estimée', type: 'money', width: 13 },
      ],
      rows,
      totals: { revenue: sum(rows, 'revenue'), margin: sum(rows, 'margin') },
      summary: [
        { label: 'Produits vendus', value: rows.length, type: 'int' },
        { label: "Chiffre d'affaires HT", value: sum(rows, 'revenue'), type: 'money' },
        { label: 'Marge brute estimée', value: sum(rows, 'margin'), type: 'money' },
      ],
    };
  },
};

async function build(type, q) {
  const builder = REPORTS[type];
  if (!builder) throw new AppError(404, 'Rapport inconnu');
  const report = await builder(q);
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  report.type = type;
  report.generated_at = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:00`;
  return report;
}

module.exports = { build, types: Object.keys(REPORTS) };
