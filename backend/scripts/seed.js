/**
 * Génère les données de DÉMONSTRATION (fictives) puis les exporte dans database/seed.sql.
 *
 *   npm run db:seed
 *
 * Les données sont créées en appelant les mêmes services métier que l'API
 * (mouvements de stock, confirmation de facture, paiements…) : les stocks, les
 * factures, les paiements et le journal sont donc cohérents par construction.
 *
 * Tous les noms de clients, fournisseurs, matricules fiscaux et montants sont inventés.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DATABASE_DIR, runSqlFile } = require('./lib');

const SUPPLIERS = [
  ['Panneaux du Sahel SARL', '+216 73 000 101', 'commercial@panneaux-sahel.example', 'Zone industrielle, Sousse', '1000101A/A/M/000', 'Panneaux MDF, mélaminés et contreplaqués. Livraison sous 48 h.'],
  ['Bois Import Méditerranée', '+216 71 000 202', 'ventes@bois-import-med.example', 'Zone portuaire, Radès', '1000202B/A/M/000', 'Importateur de bois massif (sapin, hêtre, chêne).'],
  ['ColleTech Tunisie', '+216 74 000 303', 'contact@colletech.example', 'Route de Gabès, Sfax', '1000303C/A/M/000', 'Colles vinyliques, néoprène et thermofusibles.'],
  ['Chants & Décors Industrie', '+216 79 000 404', 'info@chants-decors.example', 'Zone industrielle, Ben Arous', '1000404D/A/M/000', 'Bandes de chant PVC et ABS, toutes finitions.'],
  ['Quincaillerie Générale du Centre', '+216 77 000 505', 'ventes@qgc.example', 'Avenue de la République, Kairouan', '1000505E/A/M/000', 'Visserie, charnières, coulisses, abrasifs.'],
];

const CUSTOMERS = [
  ['Menuiserie El Amen', '+216 20 000 111', 'elamen.menuiserie@example.tn', 'Route de Tunis km 4, Sfax', '2000111F/A/M/000', 'Client régulier — paiement par chèque.'],
  ['Atelier Bois & Design', '+216 22 000 222', 'contact@boisdesign.example.tn', 'Rue des Artisans, Sousse', '2000222G/A/M/000', 'Agencement de cuisines et dressings.'],
  ['Mohamed Trabelsi', '+216 98 000 333', null, 'Cité El Khadra, Tunis', null, 'Ébéniste indépendant — paiement comptant.'],
  ['Société Meubles Jasmin SARL', '+216 71 000 444', 'achats@meubles-jasmin.example.tn', 'Zone industrielle Charguia, Tunis', '2000444H/A/M/000', 'Fabricant de meubles — commandes volumineuses.'],
  ['Karim Ben Salah', '+216 55 000 555', 'karim.bensalah@example.tn', 'Avenue Habib Bourguiba, Monastir', null, null],
  ['Menuiserie Moderne Chaabane', '+216 24 000 666', 'chaabane.menuiserie@example.tn', 'Route de Mahdia, Sfax', '2000666J/A/M/000', null],
  ['Cuisines Élégance', '+216 29 000 777', 'commandes@cuisines-elegance.example.tn', 'Boulevard de l’Environnement, Nabeul', '2000777K/A/M/000', 'Cuisiniste — délai de paiement 30 jours.'],
  ['Hichem Gharbi', '+216 97 000 888', null, 'Rue Ibn Khaldoun, Kairouan', null, 'Particulier.'],
];

// [sku, désignation, catégorie, unité, prix achat, prix vente, stock initial, seuil, fournisseur (index), description]
const PRODUCTS = [
  ['MDF-03', 'MDF brut 3 mm (1220 × 2440)', 1, 'sheet', 14.5, 18.9, 120, 30, 0, 'Panneau de fibres moyenne densité, fond de meuble et tiroirs.'],
  ['MDF-06', 'MDF brut 6 mm (1220 × 2440)', 1, 'sheet', 22, 28.5, 100, 25, 0, 'Panneau MDF standard 6 mm.'],
  ['MDF-12', 'MDF brut 12 mm (1220 × 2440)', 1, 'sheet', 38, 48, 80, 20, 0, 'Panneau MDF standard 12 mm.'],
  ['MDF-16', 'MDF brut 16 mm (1220 × 2440)', 1, 'sheet', 49, 62, 90, 25, 0, 'Panneau MDF standard 16 mm, caissons et étagères.'],
  ['MDF-18', 'MDF brut 18 mm (1220 × 2440)', 1, 'sheet', 56, 71, 110, 30, 0, 'Panneau MDF standard 18 mm, usage général en agencement.'],
  ['MDF-18-HYD', 'MDF hydrofuge 18 mm (1220 × 2440)', 1, 'sheet', 78, 98, 40, 12, 0, 'MDF résistant à l’humidité pour cuisines et salles de bain.'],
  ['MEL-18-BLC', 'Panneau mélaminé blanc 18 mm (2800 × 2070)', 1, 'sheet', 95, 120, 60, 15, 0, 'Support MDF, deux faces mélaminées blanc mat.'],
  ['MEL-18-CHN', 'Panneau mélaminé chêne clair 18 mm (2800 × 2070)', 1, 'sheet', 110, 139, 35, 12, 0, 'Décor chêne clair, deux faces.'],
  ['CHT-PVC-22-BLC', 'Chant PVC blanc 22 × 0,4 mm (rouleau 100 m)', 2, 'roll', 28, 38, 50, 12, 3, 'Bande de chant PVC non encollée, blanc mat.'],
  ['CHT-PVC-22-CHN', 'Chant PVC chêne clair 22 × 1 mm (rouleau 50 m)', 2, 'roll', 42, 56, 30, 10, 3, 'Assorti au mélaminé chêne clair.'],
  ['CHT-ABS-43-NR', 'Chant ABS noir 43 × 2 mm', 2, 'meter', 1.2, 1.9, 800, 200, 3, 'Chant épais vendu au mètre linéaire.'],
  ['COL-VIN-5KG', 'Colle vinylique à bois D2 (seau de 5 kg)', 3, 'piece', 24, 32, 45, 12, 2, 'Colle blanche pour assemblages intérieurs.'],
  ['COL-NEO-1L', 'Colle néoprène de contact', 3, 'liter', 13.5, 18.5, 60, 15, 2, 'Collage des stratifiés et placages, vendue au litre.'],
  ['COL-HM-GRN', 'Colle thermofusible en granulés pour plaqueuse de chants', 3, 'kilogram', 11, 15.5, 120, 25, 2, 'Colle hot-melt EVA, vendue au kilogramme.'],
  ['PRE-SAP-2770', 'Tasseau sapin raboté 27 × 70 mm (longueur 3 m)', 4, 'piece', 9.5, 13.5, 150, 40, 1, 'Sapin raboté 4 faces, prêt à l’emploi.'],
  ['PRE-HET-PLT', 'Plateau hêtre prédécoupé 30 × 200 × 2000 mm', 4, 'piece', 36, 49, 40, 10, 1, 'Hêtre étuvé découpé à dimension.'],
  ['PRE-MDF-ETG', 'Étagère MDF prédécoupée 18 × 400 × 800 mm', 4, 'piece', 8, 12.5, 120, 30, 0, 'Étagère découpée à dimension, chants bruts.'],
  ['BRT-SAP-RGE', 'Sapin rouge du Nord — madrier 63 × 175 mm', 5, 'meter', 14, 19.5, 400, 100, 1, 'Bois brut de sciage, vendu au mètre linéaire.'],
  ['BRT-HET-50', 'Hêtre étuvé avivé 50 mm', 5, 'meter', 32, 44, 150, 40, 1, 'Plots avivés, séchés, vendus au mètre linéaire.'],
  ['BRT-CHN-27', 'Chêne avivé 27 mm', 5, 'meter', 58, 79, 60, 20, 1, 'Chêne de menuiserie, vendu au mètre linéaire.'],
  ['AUT-CTP-15', 'Contreplaqué okoumé 15 mm (1220 × 2440)', 6, 'sheet', 68, 86, 30, 10, 0, 'Contreplaqué intérieur, faces okoumé.'],
  ['AUT-VIS-440', 'Vis à bois 4 × 40 mm (boîte de 500)', 6, 'pack', 9, 13.5, 80, 20, 4, 'Vis agglo tête fraisée, zinguées.'],
  ['AUT-CHRN-35', 'Charnières invisibles 35 mm (paquet de 10)', 6, 'pack', 12, 17.5, 60, 15, 4, 'Charnières à boîtier pour portes de meubles.'],
  ['AUT-COUL-45', 'Coulisses à billes 450 mm (la paire)', 6, 'piece', 7.5, 11, 90, 24, 4, 'Coulisses à sortie totale pour tiroirs.'],
  ['AUT-ABR-120', 'Papier abrasif grain 120 (rouleau de 25 m)', 6, 'roll', 22, 31, 20, 6, 4, 'Abrasif pour ponçage de finition.'],
];

async function main() {
  console.log('Réinitialisation du schéma…');
  await runSqlFile('schema.sql');

  // Chargés après la création de la base
  const { pool, withTransaction } = require('../src/config/db');
  const stock = require('../src/services/stockService');
  const invoices = require('../src/services/invoiceService');

  await pool.query("UPDATE settings SET setting_value = '1' WHERE setting_key = 'demo_mode'");

  // ---- Utilisateurs ----
  await pool.query('INSERT INTO users (id, username, full_name, email, password_hash, role, created_at) VALUES ?', [
    [
      [1, 'admin', 'Administrateur', 'admin@exemple.tn', await bcrypt.hash('admin123', 10), 'admin', '2026-06-01 08:00:00'],
      [2, 'employe', 'Agent commercial', 'employe@exemple.tn', await bcrypt.hash('employe123', 10), 'employee', '2026-06-01 08:00:00'],
    ],
  ]);
  const ADMIN = 1;
  const EMPLOYEE = 2;

  // ---- Fournisseurs, clients, produits ----
  await pool.query('INSERT INTO suppliers (name, phone, email, address, tax_id, notes, created_at) VALUES ?', [SUPPLIERS.map((s) => [...s, '2026-06-01 08:30:00'])]);
  await pool.query('INSERT INTO customers (name, phone, email, address, tax_id, notes, created_at) VALUES ?', [CUSTOMERS.map((c) => [...c, '2026-06-01 08:45:00'])]);
  await pool.query(
    'INSERT INTO products (sku, name, category_id, unit, purchase_price, selling_price, quantity, min_stock, supplier_id, description, created_at) VALUES ?',
    [PRODUCTS.map((p) => [p[0], p[1], p[2], p[3], p[4], p[5], 0, p[7], p[8] + 1, p[9], '2026-06-01 09:00:00'])]
  );
  const [productRows] = await pool.query('SELECT id, sku FROM products');
  const P = Object.fromEntries(productRows.map((r) => [r.sku, r.id]));

  // ---- Scénario chronologique ----
  const events = [];
  const at = (date, time) => `${date} ${time}:00`;

  // Réceptions initiales (achats fournisseurs)
  PRODUCTS.forEach((p, i) => {
    const supplier = p[8] + 1;
    const day = 2 + (supplier - 1); // un bon de livraison par fournisseur, du 2 au 6 juin
    events.push({
      at: at(`2026-06-0${day}`, `09:${String(10 + i).padStart(2, '0')}`),
      run: (conn, when) =>
        stock.applyMovement(conn, {
          productId: P[p[0]], type: 'IN', quantity: p[6], unitCost: p[4], supplierId: supplier,
          reference: `BL-2026-00${supplier}`, notes: 'Réception de la commande d’ouverture', userId: ADMIN, at: when,
        }),
    });
  });

  // Mouvements manuels
  const manual = (when, m) => events.push({ at: when, run: (conn, w) => stock.applyMovement(conn, { ...m, productId: P[m.sku], at: w }) });
  manual(at('2026-08-12', '11:20'), { sku: 'AUT-CTP-15', type: 'OUT', quantity: 2, reference: 'CASSE-0812', notes: 'Panneaux endommagés lors du déchargement', userId: EMPLOYEE });
  manual(at('2026-09-10', '15:05'), { sku: 'AUT-ABR-120', type: 'OUT', quantity: 2, reference: 'INTERNE-0910', notes: 'Consommation interne — atelier de découpe', userId: EMPLOYEE });
  manual(at('2026-09-30', '17:30'), { sku: 'BRT-CHN-27', type: 'ADJUSTMENT', newQuantity: 57, reference: 'INV-2026-09', notes: 'Inventaire de fin de trimestre : écart de 3 m (chutes non déclarées)', userId: ADMIN });
  manual(at('2026-10-20', '10:00'), { sku: 'MDF-16', type: 'IN', quantity: 50, unitCost: 49.5, supplierId: 1, reference: 'BL-2026-014', notes: 'Réapprovisionnement', userId: ADMIN });
  manual(at('2026-10-20', '10:05'), { sku: 'MEL-18-BLC', type: 'IN', quantity: 40, unitCost: 96, supplierId: 1, reference: 'BL-2026-014', notes: 'Réapprovisionnement', userId: ADMIN });
  manual(at('2026-10-21', '09:40'), { sku: 'COL-VIN-5KG', type: 'IN', quantity: 30, unitCost: 24.5, supplierId: 3, reference: 'BL-2026-015', notes: 'Réapprovisionnement', userId: ADMIN });
  manual(at('2026-10-31', '17:45'), { sku: 'CHT-ABS-43-NR', type: 'ADJUSTMENT', newQuantity: 556, reference: 'INV-2026-10', notes: 'Inventaire mensuel : 6 m retrouvés en réserve', userId: ADMIN });

  // Factures : [date, client, lignes [sku, qté, remise %], remise globale %, paiements [date, montant | 'solde' | fraction, mode, référence], annulation]
  const INVOICES = [
    ['2026-06-10', 1, [['MDF-18', 20], ['MEL-18-BLC', 10], ['CHT-PVC-22-BLC', 4], ['COL-VIN-5KG', 3]], 0, [['2026-06-15', 'solde', 'cheque', 'CHQ 0458712']]],
    ['2026-06-24', 3, [['PRE-SAP-2770', 30], ['AUT-VIS-440', 5], ['COL-NEO-1L', 4]], 0, [['2026-06-24', 'solde', 'cash', null]]],
    ['2026-07-08', 2, [['MEL-18-CHN', 12], ['CHT-PVC-22-CHN', 6], ['AUT-CHRN-35', 10], ['AUT-COUL-45', 20]], 3, [['2026-07-20', 'solde', 'bank_transfer', 'VIR 20260720-118']]],
    ['2026-07-22', 4, [['MDF-16', 40, 5], ['MDF-18-HYD', 15], ['COL-HM-GRN', 30]], 0, [['2026-07-30', 2000, 'bank_transfer', 'VIR 20260730-042']]],
    ['2026-08-05', 5, [['BRT-SAP-RGE', 60], ['PRE-HET-PLT', 6]], 0, [['2026-08-05', 'solde', 'cash', null]]],
    ['2026-08-19', 6, [['MDF-18', 35], ['MDF-12', 20], ['CHT-ABS-43-NR', 250], ['COL-VIN-5KG', 8]], 0, [['2026-08-25', 0.5, 'cheque', 'CHQ 7730215'], ['2026-09-05', 'solde', 'cash', null]]],
    ['2026-09-03', 7, [['MEL-18-BLC', 30], ['MEL-18-CHN', 14], ['CHT-PVC-22-BLC', 10], ['AUT-CHRN-35', 25], ['AUT-COUL-45', 40]], 5, [['2026-09-12', 3000, 'cheque', 'CHQ 1120987']]],
    ['2026-09-17', 1, [['MDF-06', 30], ['MDF-03', 40], ['PRE-MDF-ETG', 50]], 0, [['2026-09-25', 'solde', 'bank_transfer', 'VIR 20260925-077']]],
    ['2026-10-01', 8, [['BRT-HET-50', 40], ['BRT-CHN-27', 25], ['COL-NEO-1L', 6]], 0, [], ['2026-10-03', 'Commande annulée par le client avant enlèvement']],
    ['2026-10-14', 2, [['MDF-18', 30], ['MDF-18-HYD', 16], ['AUT-CTP-15', 12], ['AUT-ABR-120', 8]], 0, []],
    ['2026-10-28', 4, [['MDF-16', 30], ['COL-HM-GRN', 50], ['AUT-VIS-440', 20]], 0, [['2026-11-04', 'solde', 'bank_transfer', 'VIR 20261104-203']]],
    ['2026-11-05', 6, [['MEL-18-BLC', 15], ['CHT-PVC-22-CHN', 16], ['COL-VIN-5KG', 25], ['PRE-SAP-2770', 60]], 0, []],
  ];

  const invoiceIds = [];
  INVOICES.forEach(([date, customer, lines, discount, payments, cancellation], idx) => {
    events.push({
      at: at(date, `10:${String(15 + idx).padStart(2, '0')}`),
      run: async (conn, when) => {
        const due = new Date(`${date}T12:00:00Z`);
        due.setUTCDate(due.getUTCDate() + 30);
        const id = await invoices.createDraft(
          conn,
          {
            customer_id: customer, invoice_date: date, due_date: due.toISOString().slice(0, 10), discount_percent: discount, vat_rate: 19,
            items: lines.map(([sku, quantity, lineDiscount]) => ({ product_id: P[sku], quantity, discount_percent: lineDiscount || 0 })),
          },
          EMPLOYEE,
          { at: when }
        );
        await invoices.confirm(conn, id, EMPLOYEE, { at: when });
        invoiceIds[idx] = id;
      },
    });
    payments.forEach(([payDate, amount, method, reference]) => {
      events.push({
        at: at(payDate, '14:30'),
        run: async (conn, when) => {
          const [[inv]] = await conn.query('SELECT total_ttc, amount_paid FROM invoices WHERE id = ?', [invoiceIds[idx]]);
          const remaining = Math.round((inv.total_ttc - inv.amount_paid) * 1000) / 1000;
          const value = amount === 'solde' ? remaining : amount < 1 ? Math.round(inv.total_ttc * amount) : amount;
          await invoices.addPayment(conn, { invoice_id: invoiceIds[idx], amount: value, method, payment_date: payDate, reference }, EMPLOYEE, { at: when });
        },
      });
    });
    if (cancellation) {
      events.push({ at: at(cancellation[0], '09:15'), run: (conn, when) => invoices.cancel(conn, invoiceIds[idx], ADMIN, cancellation[1], { at: when }) });
    }
  });

  // Un brouillon en attente
  events.push({
    at: at('2026-11-09', '09:30'),
    run: (conn, when) =>
      invoices.createDraft(
        conn,
        { customer_id: 3, invoice_date: '2026-11-09', discount_percent: 0, vat_rate: 19, notes: 'Devis en attente de validation par le client.', items: [{ product_id: P['AUT-COUL-45'], quantity: 10 }, { product_id: P['PRE-HET-PLT'], quantity: 4 }] },
        EMPLOYEE,
        { at: when }
      ),
  });

  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of events) await withTransaction((conn) => e.run(conn, e.at));
  console.log(`${events.length} opérations de démonstration enregistrées.`);

  // `updated_at` des produits = date de leur dernier mouvement
  await pool.query('UPDATE products p SET p.updated_at = (SELECT MAX(m.created_at) FROM stock_movements m WHERE m.product_id = p.id)');
  await pool.query('UPDATE invoices SET updated_at = COALESCE(cancelled_at, confirmed_at, created_at)');

  // ---- Export vers database/seed.sql ----
  const tables = ['users', 'suppliers', 'customers', 'products', 'invoices', 'invoice_items', 'payments', 'stock_movements', 'transactions', 'sequences'];
  let sql = `-- =====================================================================
--  WoodStock — DONNÉES DE DÉMONSTRATION (fictives)
--
--  Fichier généré par « npm run db:seed » (backend/scripts/seed.js).
--  À exécuter après database/schema.sql :
--      mysql -u root -p woodstock < database/seed.sql
--
--  Les clients, fournisseurs, matricules fiscaux, factures et montants
--  ci-dessous sont inventés pour la démonstration : ils ne correspondent
--  à aucun enregistrement réel de la société.
--
--  Comptes : admin / admin123 (administrateur) — employe / employe123 (employé)
-- =====================================================================

USE woodstock;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

UPDATE settings SET setting_value = '1' WHERE setting_key = 'demo_mode';
`;
  const counts = {};
  for (const table of tables) {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    counts[table] = rows.length;
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    sql += `\n-- ${table} (${rows.length})\nINSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES\n`;
    sql += rows.map((r) => `  (${columns.map((c) => pool.escape(r[c])).join(', ')})`).join(',\n');
    sql += ';\n';
  }
  sql += '\nSET FOREIGN_KEY_CHECKS = 1;\n';
  fs.writeFileSync(path.join(DATABASE_DIR, 'seed.sql'), sql, 'utf8');
  console.log('database/seed.sql mis à jour :', counts);

  await pool.end();
}

main().catch((err) => {
  console.error('Échec de la génération des données :', err);
  process.exit(1);
});
