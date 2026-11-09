import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, BookOpen, CreditCard, FileSpreadsheet, FileText, Plus, ShoppingCart, SlidersHorizontal, TrendingUp, Truck, Wallet } from 'lucide-react';
import { downloadFile, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDebounce, useFetch } from '../utils/hooks';
import { TRANSACTION_TYPES, addDaysISO, firstOfMonthISO, firstOfYearISO, fmtDate, fmtDateTime, fmtMoney, monthLong, todayISO } from '../utils/format';
import { Badge, Button, DataState, Input, PageHeader, Pagination, SearchInput, SortTh, StatCard, Tabs, cx } from '../components/ui';
import MovementModal from '../components/MovementModal';
import PaymentModal from '../components/PaymentModal';

const LIMIT = 25;

const RANGES = [
  { key: 'today', label: "Aujourd'hui", range: () => [todayISO(), todayISO()] },
  { key: 'week', label: '7 derniers jours', range: () => [addDaysISO(todayISO(), -6), todayISO()] },
  { key: 'month', label: 'Ce mois', range: () => [firstOfMonthISO(), todayISO()] },
  { key: 'year', label: 'Cette année', range: () => [firstOfYearISO(), todayISO()] },
  { key: 'all', label: 'Tout', range: () => ['', ''] },
];

/** Tableau de synthèse (journalière ou mensuelle). */
function SummaryTable({ rows, monthly, onPick }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{monthly ? 'Mois' : 'Jour'}</th>
            <th className="text-right">Opérations</th>
            <th className="text-right">Ventes nettes TTC</th>
            <th className="text-right">Paiements reçus</th>
            <th className="text-right">Achats fournisseurs</th>
            <th className="text-right">Entrées de stock</th>
            <th className="text-right">Sorties de stock</th>
            <th className="text-right">Ajustements</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period} className="row-link" onClick={() => onPick(r.period)} title="Afficher le détail de cette période">
              <td className="whitespace-nowrap font-medium text-ink-900">{monthly ? monthLong(r.period) : fmtDate(r.period)}</td>
              <td className="num">{r.operations}</td>
              <td className="num font-medium text-ink-900">{fmtMoney(r.sales)}</td>
              <td className="num text-brand-800">{fmtMoney(r.payments)}</td>
              <td className="num">{fmtMoney(r.purchases)}</td>
              <td className="num">{r.stock_in_count}</td>
              <td className="num">{r.stock_out_count}</td>
              <td className="num">{r.adjustment_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Transactions() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();

  const [tab, setTab] = useState('journal');
  const [rangeKey, setRangeKey] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [types, setTypes] = useState([]);
  const [search, setSearch] = useState(params.get('recherche') || '');
  const [sort, setSort] = useState({ field: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [movement, setMovement] = useState(null);
  const [paying, setPaying] = useState(false);
  const [exporting, setExporting] = useState(null);

  const debouncedSearch = useDebounce(search);
  useEffect(() => setPage(1), [debouncedSearch, from, to, types]);

  const filters = { from, to, type: types.join(','), search: debouncedSearch };
  const { data, loading, error, reload } = useFetch('/transactions', { ...filters, sort: sort.field, order: sort.order, page, limit: LIMIT });
  const { data: summary, loading: loadingSummary, error: summaryError, reload: reloadSummary } = useFetch('/transactions/summary', { from, to });

  const refresh = () => {
    reload();
    reloadSummary();
  };

  const pickRange = (r) => {
    const [f, t] = r.range();
    setRangeKey(r.key);
    setFrom(f);
    setTo(t);
  };
  const toggleType = (t) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const onSort = (field) => setSort((s) => ({ field, order: s.field === field && s.order === 'desc' ? 'asc' : 'desc' }));
  const sortProps = { sort: sort.field, order: sort.order, onSort };

  // Clic sur une ligne de synthèse → journal filtré sur la période
  const pickPeriod = (period) => {
    if (period.length === 7) {
      const [y, m] = period.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      setFrom(`${period}-01`);
      setTo(`${period}-${String(last).padStart(2, '0')}`);
    } else {
      setFrom(period);
      setTo(period);
    }
    setRangeKey('');
    setTab('journal');
  };

  const exportFile = async (format) => {
    setExporting(format);
    try {
      await downloadFile('/reports/transactions', { ...filters, format });
      toast.success(format === 'xlsx' ? 'Export Excel téléchargé' : 'Rapport PDF téléchargé');
    } catch (err) {
      toast.error(await errorMessage(err, "L'export a échoué"));
    } finally {
      setExporting(null);
    }
  };

  const open = (t) => {
    if (t.invoice_id) navigate(`/factures/${t.invoice_id}`);
    else if (t.product_id) navigate(`/produits/${t.product_id}`);
  };

  const totals = summary?.totals;
  const filtered = Boolean(debouncedSearch || from || to || types.length);

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Journal des opérations quotidiennes : ventes, paiements, achats et mouvements de stock"
        actions={
          <>
            <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onClick={() => exportFile('xlsx')}>
              Excel
            </Button>
            <Button variant="secondary" icon={FileText} loading={exporting === 'pdf'} onClick={() => exportFile('pdf')}>
              PDF
            </Button>
          </>
        }
      />

      {/* Saisie rapide */}
      <div className="card mb-5 flex flex-wrap items-center gap-2 p-3">
        <span className="mr-1 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
          <Plus className="h-3.5 w-3.5" /> Enregistrer
        </span>
        <Button variant="secondary" size="sm" icon={ShoppingCart} onClick={() => navigate('/factures/nouvelle')}>
          Une vente
        </Button>
        <Button variant="secondary" size="sm" icon={CreditCard} onClick={() => setPaying(true)}>
          Un paiement client
        </Button>
        <Button variant="secondary" size="sm" icon={Truck} onClick={() => setMovement('IN')}>
          Un achat / une entrée de stock
        </Button>
        <Button variant="secondary" size="sm" icon={ArrowUpRight} onClick={() => setMovement('OUT')}>
          Une sortie de stock
        </Button>
        {isAdmin && (
          <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setMovement('ADJUSTMENT')}>
            Un ajustement
          </Button>
        )}
      </div>

      {/* Période */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => pickRange(r)}
              className={cx('border-r border-ink-200 px-3 py-2 text-xs font-medium last:border-r-0', rangeKey === r.key ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-50')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            value={from}
            aria-label="Du"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            onChange={(e) => {
              setFrom(e.target.value);
              setRangeKey('');
            }}
          />
          <span className="text-ink-400">au</span>
          <Input
            type="date"
            value={to}
            min={from}
            aria-label="Au"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            onChange={(e) => {
              setTo(e.target.value);
              setRangeKey('');
            }}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={TrendingUp} label="Ventes nettes TTC" value={totals ? fmtMoney(totals.sales) : '…'} hint="Factures confirmées − annulations" />
        <StatCard icon={Wallet} tone="blue" label="Paiements reçus" value={totals ? fmtMoney(totals.payments) : '…'} />
        <StatCard icon={ArrowDownLeft} tone="violet" label="Achats fournisseurs" value={totals ? fmtMoney(totals.purchases) : '…'} />
        <StatCard icon={BookOpen} tone="gray" label="Opérations enregistrées" value={totals ? totals.operations : '…'} hint={totals ? `${totals.stock_in_count} entrées · ${totals.stock_out_count} sorties · ${totals.adjustment_count} ajustements` : undefined} />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'journal', label: 'Journal', count: data?.total },
          { key: 'daily', label: 'Synthèse journalière' },
          { key: 'monthly', label: 'Synthèse mensuelle' },
        ]}
      />

      {tab === 'journal' && (
        <div className="card">
          <div className="space-y-3 border-b border-ink-100 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Référence, description, client, produit…" className="w-full sm:w-96" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-ink-500">Catégories :</span>
              {Object.entries(TRANSACTION_TYPES).map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleType(key)}
                  className={cx(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                    types.includes(key) ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                  )}
                >
                  {t.label}
                </button>
              ))}
              {types.length > 0 && (
                <button type="button" className="ml-1 text-xs font-medium text-ink-500 underline" onClick={() => setTypes([])}>
                  Effacer
                </button>
              )}
            </div>
          </div>

          <DataState
            loading={loading && !data}
            error={error}
            onRetry={reload}
            empty={data?.data.length === 0}
            emptyProps={{
              icon: BookOpen,
              title: filtered ? 'Aucune transaction pour ces critères' : 'Aucune transaction enregistrée',
              text: filtered ? 'Élargissez la période ou retirez des filtres.' : 'Les ventes, paiements et mouvements de stock apparaîtront ici automatiquement.',
            }}
          >
            {data && (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <SortTh label="Date" field="date" {...sortProps} />
                        <SortTh label="Catégorie" field="type" {...sortProps} />
                        <SortTh label="Référence" field="reference" {...sortProps} />
                        <th>Description</th>
                        <th>Utilisateur</th>
                        <SortTh label="Montant" field="amount" className="text-right" {...sortProps} />
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((t) => (
                        <tr key={t.id} className={t.invoice_id || t.product_id ? 'row-link' : ''} onClick={() => open(t)}>
                          <td className="whitespace-nowrap">{fmtDateTime(t.transaction_date)}</td>
                          <td>
                            <Badge color={TRANSACTION_TYPES[t.type].color}>{TRANSACTION_TYPES[t.type].label}</Badge>
                          </td>
                          <td className="whitespace-nowrap font-medium text-ink-800">{t.reference || '—'}</td>
                          <td className="min-w-[240px]">{t.description}</td>
                          <td className="whitespace-nowrap text-ink-500">{t.user_name}</td>
                          <td className={cx('num font-medium', t.amount < 0 ? 'text-red-600' : 'text-ink-900')}>{fmtMoney(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-ink-100 px-4 py-2 text-xs text-ink-400">
                  Les mouvements de stock sont valorisés au coût d'achat ; les ventes et paiements sont exprimés TTC.
                </p>
                <Pagination page={page} limit={LIMIT} total={data.total} onChange={setPage} />
              </>
            )}
          </DataState>
        </div>
      )}

      {tab !== 'journal' && (
        <div className="card">
          <DataState
            loading={loadingSummary && !summary}
            error={summaryError}
            onRetry={reloadSummary}
            empty={summary && summary[tab].length === 0}
            emptyProps={{ icon: BookOpen, title: 'Aucune opération sur cette période', text: 'Sélectionnez une période plus large.' }}
          >
            {summary && <SummaryTable rows={summary[tab]} monthly={tab === 'monthly'} onPick={pickPeriod} />}
          </DataState>
        </div>
      )}

      <MovementModal open={Boolean(movement)} defaultType={movement || 'IN'} onClose={() => setMovement(null)} onSaved={refresh} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} onSaved={refresh} />
    </>
  );
}
