const router = require('express').Router();
const { query } = require('../config/db');
const { asyncHandler } = require('../utils/helpers');

/** Liste des 12 derniers mois au format YYYY-MM (du plus ancien au plus récent). */
function last12Months() {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Toutes les statistiques sont calculées à partir des enregistrements réels de la base.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const months = last12Months();

    const [
      [products],
      [customers],
      [invoices],
      [payments],
      lowStock,
      recentInvoices,
      recentMovements,
      monthlyRows,
      bestSellers,
      stockByCategory,
    ] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(quantity * purchase_price), 0) AS stock_value,
                COALESCE(SUM(quantity <= min_stock), 0) AS low_stock
           FROM products WHERE is_active = 1`
      ),
      query('SELECT COUNT(*) AS total FROM customers'),
      query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(total_ttc), 0) AS revenue, COALESCE(SUM(total_ht), 0) AS revenue_ht,
                COALESCE(SUM(total_ttc - amount_paid), 0) AS receivables,
                COALESCE(SUM(payment_status IN ('unpaid', 'partial')), 0) AS unpaid_count
           FROM invoices WHERE status = 'confirmed'`
      ),
      query('SELECT COALESCE(SUM(amount), 0) AS collected FROM payments'),
      query(
        `SELECT p.id, p.sku, p.name, p.unit, p.quantity, p.min_stock, c.name AS category_name
           FROM products p JOIN categories c ON c.id = p.category_id
          WHERE p.is_active = 1 AND p.quantity <= p.min_stock
          ORDER BY (p.quantity / NULLIF(p.min_stock, 0)), p.name LIMIT 8`
      ),
      query(
        `SELECT i.id, i.invoice_number, i.invoice_date, i.status, i.payment_status, i.total_ttc, c.name AS customer_name
           FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE i.status <> 'draft' ORDER BY i.invoice_date DESC, i.id DESC LIMIT 6`
      ),
      query(
        `SELECT m.id, m.type, m.quantity, m.new_quantity, m.reference, m.created_at, p.name AS product_name, p.unit, p.id AS product_id
           FROM stock_movements m JOIN products p ON p.id = m.product_id
          ORDER BY m.created_at DESC, m.id DESC LIMIT 7`
      ),
      query(
        `SELECT DATE_FORMAT(invoice_date, '%Y-%m') AS month, SUM(total_ttc) AS total, COUNT(*) AS count
           FROM invoices WHERE status = 'confirmed' AND invoice_date >= ?
          GROUP BY month`,
        [`${months[0]}-01`]
      ),
      query(
        `SELECT p.id, p.name, p.unit, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS revenue
           FROM invoice_items ii
           JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'confirmed'
           JOIN products p ON p.id = ii.product_id
          GROUP BY p.id, p.name, p.unit ORDER BY revenue DESC LIMIT 6`
      ),
      query(
        `SELECT c.name AS category, COUNT(p.id) AS products, COALESCE(SUM(p.quantity * p.purchase_price), 0) AS value
           FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
          GROUP BY c.id, c.name ORDER BY c.id`
      ),
    ]);

    const byMonth = new Map(monthlyRows.map((r) => [r.month, r]));
    const monthlySales = months.map((m) => ({ month: m, total: byMonth.get(m)?.total || 0, count: byMonth.get(m)?.count || 0 }));

    res.json({
      stats: {
        products: products.total,
        customers: customers.total,
        invoices: invoices.total,
        revenue: invoices.revenue,
        revenue_ht: invoices.revenue_ht,
        collected: payments.collected,
        receivables: invoices.receivables,
        unpaid_invoices: Number(invoices.unpaid_count),
        stock_value: products.stock_value,
        low_stock: Number(products.low_stock),
      },
      low_stock_products: lowStock,
      recent_invoices: recentInvoices,
      recent_movements: recentMovements,
      monthly_sales: monthlySales,
      best_sellers: bestSellers,
      stock_by_category: stockByCategory,
    });
  })
);

module.exports = router;
