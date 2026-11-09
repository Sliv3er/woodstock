import { Link, useNavigate } from 'react-router-dom';
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, FileText, Package, Plus, SlidersHorizontal, TrendingUp, Users, Wallet } from 'lucide-react';
import { useFetch } from '../utils/hooks';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, DataState, EmptyState, PageHeader, StatCard } from '../components/ui';
import { INVOICE_STATUS, PAYMENT_STATUS, fmtDate, fmtDateTime, fmtMoney, fmtMoneyShort, fmtQty, monthShort } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif';
ChartJS.defaults.color = '#64748b';

const PALETTE = ['#15803d', '#0f172a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#94a3b8', '#14b8a6', '#ef4444'];
const MOVEMENT_ICONS = { IN: [ArrowDownLeft, 'bg-brand-50 text-brand-700'], OUT: [ArrowUpRight, 'bg-red-50 text-red-600'], ADJUSTMENT: [SlidersHorizontal, 'bg-amber-50 text-amber-700'] };

const moneyTooltip = { callbacks: { label: (ctx) => ` ${fmtMoney(ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed)}` } };

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="card flex flex-col">
      <div className="card-header">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 p-5">{empty ? <EmptyState title="Pas encore de données" text="Ce graphique se remplira avec les premières opérations." /> : <div className="h-64">{children}</div>}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch('/dashboard');

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`Bonjour ${user.full_name} — vue d'ensemble de l'activité`}
        actions={
          <Button icon={Plus} onClick={() => navigate('/factures/nouvelle')}>
            Nouvelle facture
          </Button>
        }
      />

      <DataState loading={loading} error={error} onRetry={reload}>
        {data && (
          <div className="space-y-5">
            {/* Indicateurs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <StatCard icon={TrendingUp} label="Chiffre d'affaires TTC" value={fmtMoney(data.stats.revenue)} hint={`${fmtMoney(data.stats.collected)} encaissés`} />
              <StatCard icon={Boxes} tone="blue" label="Valeur du stock" value={fmtMoney(data.stats.stock_value)} hint="Valorisé au prix d'achat" />
              <StatCard icon={FileText} tone="violet" label="Factures" value={data.stats.invoices} hint={`${data.stats.unpaid_invoices} en attente de règlement`} />
              <StatCard icon={Wallet} tone="amber" label="Reste à encaisser" value={fmtMoney(data.stats.receivables)} hint="Créances clients" />
              <StatCard icon={Package} tone="gray" label="Produits" value={data.stats.products} hint={`${data.stats.low_stock} en stock faible`} />
              <StatCard icon={Users} tone="gray" label="Clients" value={data.stats.customers} />
            </div>

            {/* Graphiques */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ChartCard title="Ventes mensuelles" subtitle="Factures confirmées, montants TTC — 12 derniers mois" empty={data.monthly_sales.every((m) => !m.total)}>
                  <Bar
                    data={{
                      labels: data.monthly_sales.map((m) => monthShort(m.month)),
                      datasets: [{ label: 'Ventes TTC', data: data.monthly_sales.map((m) => m.total), backgroundColor: '#15803d', borderRadius: 5, maxBarThickness: 38 }],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: moneyTooltip },
                      scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { callback: (v) => fmtMoneyShort(v) } },
                      },
                    }}
                  />
                </ChartCard>
              </div>
              <ChartCard title="Répartition du stock" subtitle="Valeur par catégorie de produits" empty={data.stock_by_category.every((c) => !c.value)}>
                <Doughnut
                  data={{
                    labels: data.stock_by_category.map((c) => c.category),
                    datasets: [{ data: data.stock_by_category.map((c) => c.value), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } } }, tooltip: moneyTooltip },
                  }}
                />
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ChartCard title="Produits les plus vendus" subtitle="Chiffre d'affaires HT des factures confirmées" empty={!data.best_sellers.length}>
                  <Bar
                    data={{
                      labels: data.best_sellers.map((p) => (p.name.length > 38 ? `${p.name.slice(0, 36)}…` : p.name)),
                      datasets: [{ label: 'CA HT', data: data.best_sellers.map((p) => p.revenue), backgroundColor: '#0f172a', borderRadius: 5, maxBarThickness: 22 }],
                    }}
                    options={{
                      indexAxis: 'y',
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => ` ${fmtMoney(ctx.parsed.x)} — ${fmtQty(data.best_sellers[ctx.dataIndex].quantity, data.best_sellers[ctx.dataIndex].unit)} vendus` } },
                      },
                      scales: {
                        x: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { callback: (v) => fmtMoneyShort(v) } },
                        y: { grid: { display: false } },
                      },
                    }}
                  />
                </ChartCard>
              </div>

              {/* Alertes de stock */}
              <div className="card flex flex-col">
                <div className="card-header">
                  <h2 className="card-title flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Stock faible
                  </h2>
                  <Link to="/produits?stock=alert" className="text-xs font-medium text-brand-700 hover:underline">
                    Tout voir
                  </Link>
                </div>
                {data.low_stock_products.length === 0 ? (
                  <EmptyState icon={Package} title="Aucune alerte" text="Tous les produits sont au-dessus de leur seuil minimum." />
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {data.low_stock_products.map((p) => (
                      <li key={p.id}>
                        <Link to={`/produits/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-ink-50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-800">{p.name}</p>
                            <p className="text-xs text-ink-400">
                              {p.sku} · seuil {fmtQty(p.min_stock, p.unit)}
                            </p>
                          </div>
                          <Badge color={p.quantity === 0 ? 'red' : 'amber'}>{fmtQty(p.quantity, p.unit)}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Activité récente */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Factures récentes</h2>
                  <Link to="/factures" className="text-xs font-medium text-brand-700 hover:underline">
                    Toutes les factures
                  </Link>
                </div>
                {data.recent_invoices.length === 0 ? (
                  <EmptyState icon={FileText} title="Aucune facture" />
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {data.recent_invoices.map((inv) => {
                      const status = inv.status === 'cancelled' ? INVOICE_STATUS.cancelled : PAYMENT_STATUS[inv.payment_status];
                      return (
                        <li key={inv.id}>
                          <Link to={`/factures/${inv.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-ink-50">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink-800">{inv.customer_name}</p>
                              <p className="text-xs text-ink-400">
                                {inv.invoice_number} · {fmtDate(inv.invoice_date)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="tabular whitespace-nowrap text-sm font-medium text-ink-900">{fmtMoney(inv.total_ttc)}</p>
                              <Badge color={status.color}>{status.label}</Badge>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Derniers mouvements de stock</h2>
                  <Link to="/stock" className="text-xs font-medium text-brand-700 hover:underline">
                    Tout l'historique
                  </Link>
                </div>
                {data.recent_movements.length === 0 ? (
                  <EmptyState icon={Boxes} title="Aucun mouvement" />
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {data.recent_movements.map((m) => {
                      const [Icon, tone] = MOVEMENT_ICONS[m.type];
                      return (
                        <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link to={`/produits/${m.product_id}`} className="block truncate text-sm font-medium text-ink-800 hover:underline">
                              {m.product_name}
                            </Link>
                            <p className="text-xs text-ink-400">
                              {fmtDateTime(m.created_at)}
                              {m.reference ? ` · ${m.reference}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="tabular text-sm font-medium text-ink-900">
                              {m.type === 'IN' ? '+' : m.type === 'OUT' ? '−' : '±'}
                              {fmtQty(m.quantity, m.unit)}
                            </p>
                            <p className="tabular text-xs text-ink-400">stock : {fmtQty(m.new_quantity)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
