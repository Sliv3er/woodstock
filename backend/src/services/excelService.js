const ExcelJS = require('exceljs');
const L = require('../utils/labels');

const NUM_FORMATS = { money: '#,##0.000', qty: '#,##0.###', int: '0' };

function cellValue(value, type) {
  if (value == null || value === '') return null;
  if (type === 'money' || type === 'qty' || type === 'int') return Number(value);
  if (type === 'date') return L.fmtDate(value);
  if (type === 'datetime') return L.fmtDate(value, true);
  return value;
}

/** Construit un classeur Excel à partir d'un rapport { title, subtitle, columns, rows, totals }. */
async function reportWorkbook(report, company) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WoodStock';
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '), {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const n = report.columns.length;
  ws.mergeCells(1, 1, 1, n);
  ws.getCell(1, 1).value = company.company_name || '';
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF15803D' } };
  ws.mergeCells(2, 1, 2, n);
  ws.getCell(2, 1).value = report.title;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, n);
  ws.getCell(3, 1).value = `${report.subtitle || ''} — édité le ${L.fmtDate(report.generated_at, true)}${company.demo_mode ? ' — données de démonstration' : ''}`;
  ws.getCell(3, 1).font = { italic: true, color: { argb: 'FF64748B' } };

  const header = ws.getRow(5);
  report.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: NUM_FORMATS[c.type] ? 'right' : 'left' };
    ws.getColumn(i + 1).width = Math.max((c.width || 10) * 1.6, c.label.length + 4);
    if (NUM_FORMATS[c.type]) ws.getColumn(i + 1).numFmt = NUM_FORMATS[c.type];
  });
  header.height = 20;

  for (const row of report.rows) {
    ws.addRow(report.columns.map((c) => cellValue(row[c.key], c.type)));
  }

  if (report.totals && report.rows.length) {
    const totalRow = ws.addRow(report.columns.map((c, i) => (i === 0 && report.totals[c.key] === undefined ? 'TOTAL' : cellValue(report.totals[c.key], c.type))));
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    });
  }

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } };
  return wb;
}

module.exports = { reportWorkbook };
