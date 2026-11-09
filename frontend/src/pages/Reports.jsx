import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeftRight, BarChart3, BookOpen, Boxes, CreditCard, FileSpreadsheet, FileText, HandCoins, ShoppingBag } from 'lucide-react';
import { downloadFile, errorMessage } from '../api/client';
import { useFetch } from '../utils/hooks';
import { PAYMENT_METHODS, firstOfMonthISO, firstOfYearISO, fmtDate, fmtDateTime, fmtNumber, fmtQty, todayISO } from '../utils/format';
import { Button, DataState, Field, Input, PageHeader, Select, cx } from '../components/ui';

const REPORTS = [
  { key: 'sales', label: 'Journal des ventes', text: 'Factures confirmées, TVA et règlements', icon: FileText, filters: ['period'] },
  { key: 'products', label: 'Ventes par produit', text: 'Quantités vendues, chiffre d’affaires, marge', icon: ShoppingBag, filters: ['period'] },
  { key: 'receivables', label: 'Créances clients', text: 'Factures non soldées et retards', icon: HandCoins, filters: [] },
  { key: 'payments', label: 'Paiements clients', text: 'Encaissements par mode de paiement', icon: CreditCard, filters: ['period', 'method'] },
  { key: 'stock', label: 'État du stock', text: 'Inventaire valorisé au prix d’achat', icon: Boxes, filters: ['category', 'alert'] },
  { key: 'movements', label: 'Mouvements de stock', text: 'Entrées, sorties et ajustements', icon: ArrowLeftRight, filters: ['period', 'movementType'] },
  { key: 'transactions', label: 'Journal des transactions', text: 'Toutes les opérations quotidiennes', icon: BookOpen, filters: ['period'] },
];

const PREVIEW_ROWS = 100;

function cell(value, type) {
  if (value == null || value === '') return '—';
  if (type === 'money') return fmtNumber(value);
  if (type === 'qty') return fmtQty(value);
  if (type === 'date') return fmtDate(value);
  if (type === 'datetime') return fmtDateTime(value);
  return value;
}

const isNumeric = (type) => ['money', 'qty', 'int'].includes(type);

export default function Reports() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState(firstOfYearISO());
  const [to, setTo] = useState(todayISO());
  const [method, setMethod] = useState('');
  const [category, setCategory] = useState('');
  const [alertOnly, setAlertOnly] = useState(false);
  const [movementType, setMovementType] = useState('');
  const [exporting, setExporting] = useState(null);

  const current = REPORTS.find((r) => r.key === type);
  const has = (f) => current.filters.includes(f);
  const { data: categories } = useFetch('/categories');

  const query = {
    ...(has('period') ? { from, to } : {}),
    ...(has('method') && method ? { method } : {}),
    ...(has('category') && category ? { category_id: category } : {}),
    ...(has('alert') && alertOnly ? { stock: 'alert' } : {}),
    ...(has('movementType') && movementType ? { type: movementType } : {}),
  };
  const { data: report, loading, error, reload } = useFetch(`/reports/${type}`, query);

  const exportFile = async (format) => {
    setExporting(format);
    try {
      await downloadFile(`/reports/${type}`, { ...query, format });
      toast.success(format === 'xlsx' ? 'Export Excel téléchargé' : 'Rapport PDF téléchargé');
    } catch (err) {
      toast.error(await errorMessage(err, "L'export a échoué"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader title="Rapports" subtitle="Aperçu à l'écran, export Excel et PDF" />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Choix du rapport */}
        <div className="card h-fit p-2">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setType(r.key)}
              className={cx('flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition', type === r.key ? 'bg-brand-50' : 'hover:bg-ink-50')}
            >
              <r.icon className={cx('mt-0.5 h-[18px] w-[18px] shrink-0', type === r.key ? 'text-brand-700' : 'text-ink-400')} />
              <span>
                <span className={cx('block text-sm font-medium', type === r.key ? 'text-brand-800' : 'text-ink-800')}>{r.label}</span>
                <span className="block text-xs text-ink-500">{r.text}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 space-y-5">
          {/* Critères */}
          <div className="card flex flex-wrap items-end gap-3 p-4">
            {has('period') && (
              <>
                <Field label="Du">
                  <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                </Field>
                <Field label="Au">
                  <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-40" />
                </Field>
                <div className="flex gap-1 pb-0.5">
                  <Button variant="ghost" size="sm" onClick={() => (setFrom(firstOfMonthISO()), setTo(todayISO()))}>
                    Ce mois
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => (setFrom(firstOfYearISO()), setTo(todayISO()))}>
                    Cette année
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => (setFrom(''), setTo(''))}>
                    Tout
                  </Button>
                </div>
              </>
            )}
            {has('method') && (
              <Field label="Mode de paiement">
                <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-48">
                  <option value="">Tous</option>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {has('category') && (
              <Field label="Catégorie">
                <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-52">
                  <option value="">Toutes les catégories</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {has('alert') && (
              <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-ink-600">
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-600" checked={alertOnly} onChange={(e) => setAlertOnly(e.target.checked)} />
                Uniquement les produits à réapprovisionner
              </label>
            )}
            {has('movementType') && (
              <Field label="Type de mouvement">
                <Select value={movementType} onChange={(e) => setMovementType(e.target.value)} className="w-44">
                  <option value="">Tous</option>
                  <option value="IN">Entrées</option>
                  <option value="OUT">Sorties</option>
                  <option value="ADJUSTMENT">Ajustements</option>
                </Select>
              </Field>
            )}
            {current.filters.length === 0 && <p className="pb-2 text-sm text-ink-500">Situation à ce jour — aucun critère à renseigner.</p>}

            <div className="ml-auto flex gap-2">
              <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx'} disabled={!report} onClick={() => exportFile('xlsx')}>
                Exporter en Excel
              </Button>
              <Button icon={FileText} loading={exporting === 'pdf'} disabled={!report} onClick={() => exportFile('pdf')}>
                Exporter en PDF
              </Button>
            </div>
          </div>

          {/* Aperçu */}
          <div className="card">
            <DataState loading={loading && !report} error={error} onRetry={reload}>
              {report && (
                <>
                  <div className="border-b border-ink-100 px-5 py-4">
                    <h2 className="text-base font-semibold">{report.title}</h2>
                    <p className="text-xs text-ink-500">{report.subtitle}</p>
                    {report.summary?.length > 0 && (
                      <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                        {report.summary.map((s) => (
                          <div key={s.label} className="rounded-lg bg-ink-50 px-3 py-2.5">
                            <dt className="text-xs text-ink-500">{s.label}</dt>
                            <dd className="tabular mt-0.5 text-base font-semibold text-ink-900">
                              {s.type === 'money' ? `${fmtNumber(s.value)} DT` : s.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  {report.rows.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-14 text-center">
                      <BarChart3 className="mb-3 h-10 w-10 text-ink-300" />
                      <p className="font-medium text-ink-800">Aucune donnée pour ces critères</p>
                      <p className="mt-1 text-sm text-ink-500">Modifiez la période ou les filtres.</p>
                    </div>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              {report.columns.map((c) => (
                                <th key={c.key} className={isNumeric(c.type) ? 'text-right' : ''}>
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                              <tr key={i}>
                                {report.columns.map((c) => (
                                  <td key={c.key} className={isNumeric(c.type) ? 'num' : c.key === 'description' || c.key === 'name' ? 'min-w-[220px]' : 'whitespace-nowrap'}>
                                    {cell(row[c.key], c.type)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                          {report.totals && Object.keys(report.totals).length > 0 && (
                            <tfoot>
                              <tr className="bg-brand-50 font-semibold text-ink-900">
                                {report.columns.map((c, i) => (
                                  <td key={c.key} className={cx('px-4 py-2.5', isNumeric(c.type) && 'num')}>
                                    {report.totals[c.key] !== undefined ? cell(report.totals[c.key], c.type) : i === 0 ? 'TOTAL' : ''}
                                  </td>
                                ))}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      <p className="border-t border-ink-100 px-4 py-2.5 text-xs text-ink-400">
                        {report.rows.length > PREVIEW_ROWS
                          ? `Aperçu limité aux ${PREVIEW_ROWS} premières lignes sur ${report.rows.length} — l'export contient toutes les lignes.`
                          : `${report.rows.length} ligne(s) — montants en dinars tunisiens (DT).`}
                      </p>
                    </>
                  )}
                </>
              )}
            </DataState>
          </div>
        </div>
      </div>
    </>
  );
}
