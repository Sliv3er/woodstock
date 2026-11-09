// Journal des transactions quotidiennes.
// Chaque écriture est insérée avec la connexion `conn` de l'opération métier,
// donc dans la même transaction SQL : le journal ne peut pas diverger.

async function addEntry(conn, e) {
  const cols = {
    type: e.type,
    amount: e.amount || 0,
    reference: e.reference || null,
    description: e.description,
    invoice_id: e.invoiceId || null,
    payment_id: e.paymentId || null,
    stock_movement_id: e.movementId || null,
    product_id: e.productId || null,
    customer_id: e.customerId || null,
    supplier_id: e.supplierId || null,
    user_id: e.userId,
  };
  if (e.at) cols.transaction_date = e.at;
  const [res] = await conn.query('INSERT INTO transactions SET ?', [cols]);
  return res.insertId;
}

module.exports = { addEntry };
