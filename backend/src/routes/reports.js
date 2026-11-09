const router = require('express').Router();
const { asyncHandler } = require('../utils/helpers');
const reports = require('../services/reportService');
const settings = require('../services/settingsService');
const { reportPdf } = require('../services/pdfService');
const { reportWorkbook } = require('../services/excelService');

/**
 * GET /api/reports/:type            → aperçu JSON
 * GET /api/reports/:type?format=xlsx → export Excel
 * GET /api/reports/:type?format=pdf  → export PDF
 * Types : sales, receivables, stock, movements, payments, transactions, products
 */
router.get(
  '/:type',
  asyncHandler(async (req, res) => {
    const report = await reports.build(req.params.type, req.query);
    const { format } = req.query;
    if (!format) return res.json(report);

    const company = await settings.getAll();
    const filename = `${report.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_')}_${report.generated_at.slice(0, 10)}`;

    if (format === 'xlsx') {
      const workbook = await reportWorkbook(report, company);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    reportPdf(report, company).pipe(res);
  })
);

module.exports = router;
