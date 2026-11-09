/**
 * Tests de bout en bout des principaux scénarios métier, via l'API HTTP.
 *
 *   1. démarrer l'API :  npm start
 *   2. lancer :          npm test
 *
 * Les tests créent leurs propres enregistrements (préfixe TEST-) ; relancer
 * « npm run db:init » ensuite pour retrouver le jeu de démonstration d'origine.
 */
const { randomUUID } = require('crypto');

const API = process.env.API_URL || 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

async function call(method, url, { token, body } = {}) {
  const res = await fetch(API + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, type };
}

function check(name, condition, info = '') {
  if (condition) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✘ ${name} ${info ? `→ ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
  }
}

const section = (title) => console.log(`\n${title}`);

async function main() {
  const suffix = Date.now().toString(36).toUpperCase();

  section('Authentification et droits');
  let r = await call('GET', '/health');
  check('API et base de données disponibles', r.status === 200 && r.data.database === 'ok', r.data);
  r = await call('GET', '/products');
  check('route protégée sans jeton → 401', r.status === 401);
  r = await call('POST', '/auth/login', { body: { username: 'admin', password: 'mauvais-mot-de-passe' } });
  check('mot de passe incorrect → 401', r.status === 401);
  r = await call('POST', '/auth/login', { body: { username: 'admin', password: 'admin123' } });
  check('connexion administrateur', r.status === 200 && r.data.user.role === 'admin');
  const admin = r.data.token;
  r = await call('POST', '/auth/login', { body: { username: 'employe', password: 'employe123' } });
  check('connexion employé', r.status === 200 && r.data.user.role === 'employee');
  const employee = r.data.token;
  r = await call('GET', '/users', { token: employee });
  check('employé : gestion des utilisateurs interdite → 403', r.status === 403);
  r = await call('PUT', '/settings', { token: employee, body: { company_name: 'X', stamp_duty: 1 } });
  check('employé : paramètres interdits → 403', r.status === 403);
  r = await call('GET', '/users', { token: admin });
  check('administrateur : liste des utilisateurs', r.status === 200 && r.data.length >= 2 && !('password_hash' in r.data[0]));

  section('Produits et validation');
  r = await call('POST', '/products', { token: employee, body: { sku: '', name: '', category_id: 1, unit: 'sheet', purchase_price: -1, selling_price: 5, min_stock: 0 } });
  check('produit invalide → 400 avec détail des champs', r.status === 400 && Array.isArray(r.data.details) && r.data.details.length >= 2, r.data);
  r = await call('POST', '/products', {
    token: employee,
    body: { sku: `TEST-${suffix}`, name: 'Panneau de test', category_id: 1, unit: 'sheet', purchase_price: 10, selling_price: 15, min_stock: 5, initial_quantity: 20 },
  });
  check('création de produit avec stock initial', r.status === 201 && r.data.quantity === 20, r.data);
  const product = r.data;
  r = await call('POST', '/products', { token: employee, body: { sku: `TEST-${suffix}`, name: 'Doublon', category_id: 1, unit: 'sheet', purchase_price: 1, selling_price: 2, min_stock: 0 } });
  check('référence en double → 409', r.status === 409);
  r = await call('GET', `/products/${product.id}`, { token: employee });
  check('le stock initial est tracé par un mouvement', r.data.movements.length === 1 && r.data.movements[0].type === 'IN' && r.data.movements[0].new_quantity === 20);
  r = await call('GET', `/products?search=TEST-${suffix}&sort=quantity&order=desc`, { token: employee });
  check('recherche et tri des produits', r.status === 200 && r.data.total === 1);

  section('Mouvements de stock');
  const stockOf = async () => (await call('GET', `/products/${product.id}`, { token: admin })).data.quantity;
  r = await call('POST', '/stock/movements', { token: employee, body: { product_id: product.id, type: 'IN', quantity: 30, unit_cost: 11, supplier_id: 1, reference: 'BL-TEST' } });
  check('entrée de stock : 20 → 50', r.status === 201 && r.data.previous_quantity === 20 && r.data.new_quantity === 50, r.data);
  r = await call('POST', '/stock/movements', { token: employee, body: { product_id: product.id, type: 'OUT', quantity: 999 } });
  check('sortie supérieure au stock → 409 (stock jamais négatif)', r.status === 409 && /insuffisant/i.test(r.data.message), r.data);
  check('stock inchangé après le refus', (await stockOf()) === 50);
  const key = randomUUID();
  const out = { product_id: product.id, type: 'OUT', quantity: 5, reference: 'TEST-OUT', idempotency_key: key };
  const [a, b] = await Promise.all([call('POST', '/stock/movements', { token: employee, body: out }), call('POST', '/stock/movements', { token: employee, body: out })]);
  check('double envoi du même formulaire : un seul mouvement', [a.status, b.status].sort().join() === '201,409', [a.status, b.status]);
  check('stock = 45 après la sortie unique', (await stockOf()) === 45);
  r = await call('POST', '/stock/movements', { token: employee, body: { product_id: product.id, type: 'ADJUSTMENT', new_quantity: 40, notes: 'test' } });
  check('ajustement par un employé → 403', r.status === 403);
  r = await call('POST', '/stock/movements', { token: admin, body: { product_id: product.id, type: 'ADJUSTMENT', new_quantity: 40, notes: 'Inventaire de test' } });
  check('ajustement administrateur : 45 → 40', r.status === 201 && r.data.new_quantity === 40 && r.data.quantity === 5, r.data);
  const race = await Promise.all([1, 2, 3].map(() => call('POST', '/stock/movements', { token: employee, body: { product_id: product.id, type: 'OUT', quantity: 30 } })));
  check('3 sorties concurrentes de 30 sur un stock de 40 : une seule acceptée', race.filter((x) => x.status === 201).length === 1, race.map((x) => x.status));
  check('stock = 10 après les sorties concurrentes', (await stockOf()) === 10);
  r = await call('POST', '/stock/movements', { token: employee, body: { product_id: product.id, type: 'IN', quantity: 40 } });
  check('retour à 50 en stock', r.data.new_quantity === 50);

  section('Facturation');
  const settings = (await call('GET', '/settings', { token: employee })).data;
  check('taux de TVA configurables disponibles', settings.vat_rates.length >= 1 && settings.vat_rates.some((v) => v.is_default));
  r = await call('POST', '/invoices', {
    token: employee,
    body: { customer_id: 1, vat_rate: 19, discount_percent: 10, items: [{ product_id: product.id, quantity: 60, discount_percent: 0 }] },
  });
  check('création d’un brouillon', r.status === 201 && r.data.status === 'draft' && r.data.invoice_number.startsWith('BRO-'), r.data);
  let invoice = r.data;
  // 60 × 15 = 900 ; remise 10 % → 810 ; TVA 19 % → 153,9 ; timbre → total
  check('calcul des totaux (remise, TVA, timbre)', invoice.subtotal === 900 && invoice.total_ht === 810 && invoice.vat_amount === 153.9 && invoice.total_ttc === 963.9 + settings.stamp_duty, invoice);
  check('un brouillon ne touche pas au stock', (await stockOf()) === 50);
  r = await call('POST', `/invoices/${invoice.id}/confirm`, { token: employee });
  check('confirmation refusée si stock insuffisant → 409', r.status === 409 && /insuffisant/i.test(r.data.message), r.data);
  r = await call('GET', `/invoices/${invoice.id}`, { token: employee });
  check('facture restée en brouillon, stock intact', r.data.status === 'draft' && (await stockOf()) === 50);
  r = await call('PUT', `/invoices/${invoice.id}`, {
    token: employee,
    body: { customer_id: 1, vat_rate: 19, discount_percent: 0, items: [{ product_id: product.id, quantity: 12, unit_price: 15 }] },
  });
  check('modification du brouillon', r.status === 200 && r.data.subtotal === 180);
  r = await call('POST', `/invoices/${invoice.id}/confirm`, { token: employee });
  invoice = r.data;
  check('confirmation : numéro définitif FAC-…', r.status === 200 && invoice.status === 'confirmed' && invoice.invoice_number.startsWith('FAC-'), r.data);
  check('stock déduit automatiquement : 50 → 38', (await stockOf()) === 38);
  r = await call('GET', `/stock/movements?product_id=${product.id}&type=OUT&search=${invoice.invoice_number}`, { token: employee });
  check('mouvement de sortie lié à la facture', r.data.total === 1 && r.data.data[0].source === 'invoice' && r.data.data[0].quantity === 12);
  r = await call('POST', `/invoices/${invoice.id}/confirm`, { token: employee });
  check('double confirmation → 409', r.status === 409);
  r = await call('PUT', `/invoices/${invoice.id}`, { token: employee, body: { customer_id: 1, vat_rate: 19, items: [{ product_id: product.id, quantity: 1 }] } });
  check('facture confirmée non modifiable → 409', r.status === 409);
  r = await call('GET', `/invoices?search=${invoice.invoice_number}`, { token: employee });
  check('recherche de facture par numéro', r.data.total === 1);

  section('Paiements');
  const total = invoice.total_ttc;
  r = await call('POST', '/payments', { token: employee, body: { invoice_id: invoice.id, amount: total + 1, method: 'cash' } });
  check('paiement supérieur au reste dû → 400', r.status === 400);
  r = await call('POST', '/payments', { token: employee, body: { invoice_id: invoice.id, amount: 100, method: 'cheque', reference: 'CHQ-TEST' } });
  check('paiement partiel enregistré', r.status === 201);
  invoice = (await call('GET', `/invoices/${invoice.id}`, { token: employee })).data;
  check('état « partiellement payée »', invoice.payment_status === 'partial' && invoice.amount_paid === 100);
  r = await call('POST', '/payments', { token: employee, body: { invoice_id: invoice.id, amount: invoice.balance, method: 'bank_transfer' } });
  invoice = (await call('GET', `/invoices/${invoice.id}`, { token: employee })).data;
  check('solde réglé → « payée »', r.status === 201 && invoice.payment_status === 'paid' && invoice.balance === 0, invoice);

  section('PDF et exports');
  r = await call('GET', `/invoices/${invoice.id}/pdf`, { token: employee });
  check('facture PDF générée', r.status === 200 && r.type.includes('pdf') && r.data.subarray(0, 4).toString() === '%PDF' && r.data.length > 1500, r.type);
  for (const type of ['sales', 'receivables', 'stock', 'movements', 'payments', 'transactions', 'products']) {
    const json = await call('GET', `/reports/${type}`, { token: employee });
    const xlsx = await call('GET', `/reports/${type}?format=xlsx`, { token: employee });
    const pdf = await call('GET', `/reports/${type}?format=pdf`, { token: employee });
    check(
      `rapport « ${type} » : aperçu, Excel et PDF`,
      json.status === 200 && Array.isArray(json.data.rows) && xlsx.data.subarray(0, 2).toString() === 'PK' && pdf.data.subarray(0, 4).toString() === '%PDF',
      [json.status, xlsx.status, pdf.status]
    );
  }
  r = await call('GET', '/transactions/summary', { token: employee });
  check('synthèses quotidienne et mensuelle', r.status === 200 && r.data.daily.length > 0 && r.data.monthly.length > 0);
  r = await call('GET', `/transactions?type=sale,payment&search=${invoice.invoice_number}`, { token: employee });
  check('journal : la vente et ses 2 paiements sont inscrits', r.data.total === 3, r.data.total);

  section('Annulation contrôlée');
  r = await call('POST', `/invoices/${invoice.id}/cancel`, { token: employee, body: { reason: 'test' } });
  check('annulation par un employé → 403', r.status === 403);
  r = await call('POST', `/invoices/${invoice.id}/cancel`, { token: admin, body: { reason: 'test' } });
  check('annulation refusée tant que des paiements existent → 409', r.status === 409);
  for (const p of invoice.payments) await call('DELETE', `/payments/${p.id}`, { token: admin });
  invoice = (await call('GET', `/invoices/${invoice.id}`, { token: admin })).data;
  check('paiements supprimés → facture « impayée »', invoice.payment_status === 'unpaid' && invoice.amount_paid === 0);
  const cancels = await Promise.all([1, 2].map(() => call('POST', `/invoices/${invoice.id}/cancel`, { token: admin, body: { reason: 'Test d’annulation' } })));
  check('2 annulations simultanées : une seule acceptée', cancels.map((c) => c.status).sort().join() === '200,409', cancels.map((c) => c.status));
  check('stock restauré une seule fois : 38 → 50', (await stockOf()) === 50);
  r = await call('GET', `/stock/movements?product_id=${product.id}&search=${invoice.invoice_number}`, { token: admin });
  check('exactement 1 sortie + 1 ré-intégration pour la facture', r.data.total === 2, r.data.total);
  r = await call('POST', '/payments', { token: employee, body: { invoice_id: invoice.id, amount: 10, method: 'cash' } });
  check('paiement sur facture annulée → 409', r.status === 409);

  section('Cohérence et garde-fous');
  r = await call('GET', `/products/${product.id}`, { token: admin });
  check('quantité du produit = dernier mouvement', r.data.quantity === r.data.movements[0].new_quantity);
  r = await call('DELETE', `/products/${product.id}`, { token: employee });
  check('suppression de produit par un employé → 403', r.status === 403);
  r = await call('DELETE', `/products/${product.id}`, { token: admin });
  check('suppression refusée tant qu’il reste du stock → 409', r.status === 409);
  r = await call('DELETE', '/customers/1', { token: admin });
  check('suppression d’un client facturé → 409', r.status === 409);
  await call('POST', '/stock/movements', { token: admin, body: { product_id: product.id, type: 'ADJUSTMENT', new_quantity: 0, notes: 'Fin des tests' } });
  r = await call('DELETE', `/products/${product.id}`, { token: admin });
  check('produit avec historique → archivé (non supprimé)', r.status === 200 && r.data.deleted === false, r.data);
  r = await call('GET', '/dashboard', { token: employee });
  check('tableau de bord calculé depuis la base', r.status === 200 && r.data.stats.products > 0 && r.data.monthly_sales.length === 12 && r.data.stock_by_category.length >= 6);

  console.log(`\n${passed} test(s) réussi(s), ${failed} échec(s).`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Erreur pendant les tests :', err.message);
  console.error('L’API est-elle démarrée (npm start) ?');
  process.exit(1);
});
