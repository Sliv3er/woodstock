const PDFDocument = require('pdfkit');
const L = require('../utils/labels');

const GREEN = '#15803d';
const NAVY = '#0f172a';
const GRAY = '#64748b';
const LIGHT = '#f1f5f9';
const BORDER = '#cbd5e1';
const RED = '#b91c1c';

const DISCLAIMER = 'Document généré par WoodStock — modèle de facture non certifié fiscalement.';

/** Pied de page sur toutes les pages (pagination comprise). */
function drawFooters(doc, lines) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const { left, right } = doc.page.margins;
    const width = doc.page.width - left - right;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // autorise l'écriture dans la marge basse sans saut de page
    let y = doc.page.height - 22 - lines.length * 10;
    doc.moveTo(left, y - 6).lineTo(left + width, y - 6).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY);
    for (const line of lines) {
      doc.text(line, left, y, { width, align: 'center', lineBreak: false });
      y += 10;
    }
    doc.text(`Page ${i + 1} / ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

// =================================================================================
//  Facture
// =================================================================================
function invoicePdf(inv, company) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, left: 40, right: 40, bottom: 70 },
    bufferPages: true,
    info: { Title: `Facture ${inv.invoice_number}`, Author: company.company_name, Creator: 'WoodStock' },
  });
  const X = 40;
  const W = doc.page.width - 80;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;

  // ---- En-tête société ----
  doc.font('Helvetica-Bold').fontSize(20).fillColor(GREEN).text(company.company_name || 'Société', X, 40, { width: 300 });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  for (const line of [company.company_activity, company.company_address, company.company_phone && `Tél. : ${company.company_phone}`, company.company_email, company.company_tax_id && `Matricule fiscal : ${company.company_tax_id}`]) {
    if (line) doc.text(line, { width: 300 });
  }
  const headerBottom = doc.y;

  // ---- Bloc document ----
  const title = inv.status === 'draft' ? 'BROUILLON' : 'FACTURE';
  doc.font('Helvetica-Bold').fontSize(24).fillColor(NAVY).text(title, X + 300, 38, { width: W - 300, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(`N° ${inv.invoice_number}`, X + 300, 68, { width: W - 300, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor(GRAY);
  doc.text(`Date : ${L.fmtDate(inv.invoice_date)}`, X + 300, 86, { width: W - 300, align: 'right' });
  if (inv.due_date) doc.text(`Échéance : ${L.fmtDate(inv.due_date)}`, { width: W - 300, align: 'right' });
  if (inv.status === 'cancelled') {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(RED).text('FACTURE ANNULÉE', X + 300, doc.y + 4, { width: W - 300, align: 'right' });
  }

  let y = Math.max(headerBottom, doc.y) + 16;
  doc.moveTo(X, y).lineTo(X + W, y).lineWidth(1.5).strokeColor(GREEN).stroke();
  y += 14;

  // ---- Client ----
  const boxW = 270;
  const boxX = X + W - boxW;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('FACTURÉ À', boxX + 12, y + 10);
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(NAVY).text(inv.customer_name, boxX + 12, y + 22, { width: boxW - 24 });
  doc.font('Helvetica').fontSize(9).fillColor('#334155');
  for (const line of [inv.customer_address, inv.customer_phone && `Tél. : ${inv.customer_phone}`, inv.customer_email, inv.customer_tax_id && `Matricule fiscal : ${inv.customer_tax_id}`]) {
    if (line) doc.text(line, boxX + 12, doc.y + 1, { width: boxW - 24 });
  }
  const boxH = doc.y - y + 10;
  doc.roundedRect(boxX, y, boxW, boxH, 4).lineWidth(0.7).strokeColor(BORDER).stroke();

  doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('Établie par', X, y + 10);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(inv.created_by_name || '-', X, y + 22);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('État du règlement', X, y + 42);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(inv.payment_status === 'paid' ? GREEN : inv.payment_status === 'cancelled' ? RED : NAVY);
  doc.text(inv.status === 'draft' ? 'Brouillon (non confirmé)' : L.PAYMENT_STATUS[inv.payment_status], X, y + 54);

  y += Math.max(boxH, 72) + 18;

  // ---- Tableau des articles ----
  const cols = [
    { label: 'Réf.', w: 72 },
    { label: 'Désignation', w: 173 },
    { label: 'Qté', w: 45, align: 'right' },
    { label: 'Unité', w: 40 },
    { label: 'P.U. HT', w: 68, align: 'right' },
    { label: 'Rem. %', w: 42, align: 'right' },
    { label: 'Total HT', w: 75, align: 'right' },
  ];
  let cx = X;
  for (const c of cols) {
    c.x = cx;
    cx += c.w;
  }
  const tableHeader = () => {
    doc.rect(X, y, W, 22).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
    for (const c of cols) doc.text(c.label, c.x + 5, y + 7, { width: c.w - 10, align: c.align || 'left', lineBreak: false });
    y += 22;
  };
  tableHeader();

  inv.items.forEach((it, idx) => {
    const cells = [
      it.sku,
      it.description,
      L.fmtQty(it.quantity),
      L.UNITS_SHORT[it.unit] || it.unit,
      L.fmtNumber(it.unit_price),
      it.discount_percent ? L.fmtNumber(it.discount_percent, 2).replace(/,00$/, '') : '-',
      L.fmtNumber(it.line_total),
    ];
    doc.font('Helvetica').fontSize(9);
    const h = Math.max(doc.heightOfString(String(cells[1]), { width: cols[1].w - 10 }), doc.heightOfString(String(cells[0]), { width: cols[0].w - 10 })) + 10;
    if (y + h > pageBottom()) {
      doc.addPage();
      y = 40;
      tableHeader();
    }
    if (idx % 2 === 1) doc.rect(X, y, W, h).fill(LIGHT);
    doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
    cols.forEach((c, i) => doc.text(String(cells[i]), c.x + 5, y + 5, { width: c.w - 10, align: c.align || 'left' }));
    y += h;
  });
  doc.moveTo(X, y).lineTo(X + W, y).lineWidth(0.7).strokeColor(BORDER).stroke();
  y += 14;

  // ---- Totaux ----
  const totals = [['Total brut HT', L.fmtNumber(inv.subtotal)]];
  if (inv.discount_amount > 0) totals.push([`Remise (${L.fmtNumber(inv.discount_percent, 2).replace(/,00$/, '')} %)`, `- ${L.fmtNumber(inv.discount_amount)}`]);
  totals.push(['Total net HT', L.fmtNumber(inv.total_ht)]);
  totals.push([`TVA (${L.fmtNumber(inv.vat_rate, 2).replace(/,00$/, '')} %)`, L.fmtNumber(inv.vat_amount)]);
  if (inv.stamp_duty > 0) totals.push(['Timbre fiscal', L.fmtNumber(inv.stamp_duty)]);

  const paymentLines = inv.payments.length;
  const needed = totals.length * 17 + 30 + 60 + (paymentLines ? 40 + paymentLines * 14 : 0);
  if (y + needed > pageBottom()) {
    doc.addPage();
    y = 40;
  }

  const tW = 215;
  const tX = X + W - tW;
  const topY = y;
  for (const [label, value] of totals) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(label, tX + 8, y + 4, { width: 110, lineBreak: false });
    doc.text(value, tX + 110, y + 4, { width: tW - 118, align: 'right', lineBreak: false });
    y += 17;
  }
  doc.rect(tX, y + 2, tW, 26).fill(GREEN);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text('TOTAL TTC', tX + 8, y + 10, { lineBreak: false });
  doc.text(L.fmtMoney(inv.total_ttc), tX + 90, y + 10, { width: tW - 98, align: 'right', lineBreak: false });
  y += 34;
  if (inv.status !== 'draft' && inv.amount_paid > 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text('Montant réglé', tX + 8, y + 2, { lineBreak: false });
    doc.text(L.fmtMoney(inv.amount_paid), tX + 110, y + 2, { width: tW - 118, align: 'right', lineBreak: false });
    y += 15;
    doc.font('Helvetica-Bold').fillColor(NAVY).text('Reste à payer', tX + 8, y + 2, { lineBreak: false });
    doc.text(L.fmtMoney(inv.balance), tX + 110, y + 2, { width: tW - 118, align: 'right', lineBreak: false });
    y += 15;
  }
  const totalsBottom = y;

  // Montant en toutes lettres (à gauche des totaux)
  const wordsW = W - tW - 20;
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text('Arrêtée la présente facture à la somme de :', X, topY + 4, { width: wordsW });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text(`${L.amountInWords(inv.total_ttc)}.`, X, doc.y + 3, { width: wordsW });
  if (inv.notes) {
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text('Remarques :', X, doc.y + 10, { width: wordsW });
    doc.font('Helvetica').fontSize(9).fillColor('#334155').text(inv.notes, X, doc.y + 2, { width: wordsW });
  }
  y = Math.max(totalsBottom, doc.y) + 18;

  // ---- Règlements ----
  if (paymentLines) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Règlements enregistrés', X, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GRAY);
    doc.text('Date', X, y, { lineBreak: false });
    doc.text('Mode de paiement', X + 80, y, { lineBreak: false });
    doc.text('Référence', X + 220, y, { lineBreak: false });
    doc.text('Montant', X + 360, y, { width: 100, align: 'right', lineBreak: false });
    y += 12;
    doc.moveTo(X, y).lineTo(X + 460, y).lineWidth(0.5).strokeColor(BORDER).stroke();
    y += 4;
    doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
    for (const p of inv.payments) {
      doc.text(L.fmtDate(p.payment_date), X, y, { lineBreak: false });
      doc.text(L.PAYMENT_METHODS[p.method], X + 80, y, { lineBreak: false });
      doc.text(p.reference || '-', X + 220, y, { width: 135, lineBreak: false, ellipsis: true });
      doc.text(L.fmtMoney(p.amount), X + 360, y, { width: 100, align: 'right', lineBreak: false });
      y += 14;
    }
    y += 10;
  }

  // ---- Cachet / signature ----
  if (y + 60 < pageBottom()) {
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('Cachet et signature', X + W - 180, y + 6, { width: 180, align: 'center' });
    doc.roundedRect(X + W - 180, y + 20, 180, 50, 4).lineWidth(0.5).dash(3, { space: 3 }).strokeColor(BORDER).stroke().undash();
  }

  const footer = [];
  const legal = [company.company_name, company.company_tax_id && `MF : ${company.company_tax_id}`, company.company_rib && `RIB : ${company.company_rib}`].filter(Boolean).join('  •  ');
  if (legal) footer.push(legal);
  if (company.invoice_footer) footer.push(company.invoice_footer);
  footer.push(DISCLAIMER + (company.demo_mode ? ' Données de démonstration.' : ''));
  drawFooters(doc, footer);

  doc.end();
  return doc;
}

// =================================================================================
//  Rapports tabulaires (paysage)
// =================================================================================
function formatCell(value, type) {
  if (value == null || value === '') return '';
  switch (type) {
    case 'money':
      return L.fmtNumber(value);
    case 'qty':
      return L.fmtQty(value);
    case 'date':
      return L.fmtDate(value);
    case 'datetime':
      return L.fmtDate(value, true);
    default:
      return String(value);
  }
}

function reportPdf(report, company) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 30, left: 30, right: 30, bottom: 50 },
    bufferPages: true,
    info: { Title: report.title, Author: company.company_name, Creator: 'WoodStock' },
  });
  const X = 30;
  const W = doc.page.width - 60;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;

  doc.font('Helvetica-Bold').fontSize(15).fillColor(GREEN).text(company.company_name || '', X, 30);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(report.title, X, 30, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(report.subtitle || '', X, 50, { width: W, align: 'right' });
  doc.text(`Édité le ${L.fmtDate(report.generated_at, true)}`, X, 50);
  let y = 70;
  doc.moveTo(X, y).lineTo(X + W, y).lineWidth(1.2).strokeColor(GREEN).stroke();
  y += 10;

  // Indicateurs de synthèse
  if (report.summary?.length) {
    const cw = W / report.summary.length;
    report.summary.forEach((s, i) => {
      doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(s.label, X + i * cw, y, { width: cw - 8, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(formatCell(s.value, s.type) + (s.type === 'money' ? ' DT' : ''), X + i * cw, y + 11, { width: cw - 8, lineBreak: false });
    });
    y += 34;
  }

  const totalWeight = report.columns.reduce((s, c) => s + (c.width || 10), 0);
  let cx = X;
  const cols = report.columns.map((c) => {
    const w = ((c.width || 10) / totalWeight) * W;
    const col = { ...c, x: cx, w, align: ['money', 'qty', 'int'].includes(c.type) ? 'right' : 'left' };
    cx += w;
    return col;
  });

  const header = () => {
    doc.rect(X, y, W, 20).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    for (const c of cols) doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8, align: c.align, lineBreak: false, ellipsis: true });
    y += 20;
  };
  header();

  if (!report.rows.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(GRAY).text('Aucune donnée pour les critères sélectionnés.', X, y + 14, { width: W, align: 'center' });
  }

  report.rows.forEach((row, idx) => {
    const texts = cols.map((c) => formatCell(row[c.key], c.type));
    doc.font('Helvetica').fontSize(8);
    const h = Math.max(...texts.map((t, i) => doc.heightOfString(t || ' ', { width: cols[i].w - 8 }))) + 7;
    if (y + h > pageBottom()) {
      doc.addPage();
      y = 30;
      header();
    }
    if (idx % 2 === 1) doc.rect(X, y, W, h).fill(LIGHT);
    doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
    cols.forEach((c, i) => doc.text(texts[i], c.x + 4, y + 4, { width: c.w - 8, align: c.align }));
    y += h;
  });

  if (report.totals && report.rows.length) {
    if (y + 22 > pageBottom()) {
      doc.addPage();
      y = 30;
    }
    doc.rect(X, y, W, 20).fill('#dcfce7');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY);
    cols.forEach((c, i) => {
      const v = report.totals[c.key];
      const text = i === 0 && v === undefined ? `TOTAL (${report.rows.length} lignes)` : formatCell(v, c.type);
      if (text) doc.text(text, c.x + 4, y + 6, { width: i === 0 ? 200 : c.w - 8, align: i === 0 ? 'left' : c.align, lineBreak: false });
    });
  }

  drawFooters(doc, [`${company.company_name} — WoodStock, gestion commerciale et gestion de stock${company.demo_mode ? ' — Données de démonstration' : ''}`]);
  doc.end();
  return doc;
}

module.exports = { invoicePdf, reportPdf };
