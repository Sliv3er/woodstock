import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, MapPin, Pencil, Phone, Plus, Receipt, StickyNote } from 'lucide-react';
import { useFetch } from '../utils/hooks';
import { INVOICE_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, fmtDate, fmtDateTime, fmtMoney, fmtQty, stockState } from '../utils/format';
import { Badge, Button, DataState, EmptyState, PageHeader, StatCard, Tabs } from '../components/ui';
import PartnerFormModal from '../components/PartnerFormModal';
import { PARTNER_KINDS } from './Partners';

const Contact = ({ icon: Icon, children }) =>
  children ? (
    <p className="flex items-start gap-2 text-sm text-ink-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /> <span className="min-w-0 break-words">{children}</span>
    </p>
  ) : null;

/** Fiche d'un client (historique d'achats) ou d'un fournisseur (entrées de stock). */
export default function PartnerDetail({ kind }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const cfg = PARTNER_KINDS[kind];
  const isCustomer = kind === 'customers';
  const { data: p, loading, error, reload } = useFetch(`/${kind}/${id}`);
  const [tab, setTab] = useState('main');
  const [editing, setEditing] = useState(false);

  return (
    <DataState loading={loading && !p} error={error} onRetry={reload}>
      {p && (
        <>
          <PageHeader
            back={
              <Link to={cfg.path} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
                <ArrowLeft className="h-3.5 w-3.5" /> {cfg.title}
              </Link>
            }
            title={p.name}
            subtitle={`${isCustomer ? 'Client' : 'Fournisseur'} n° ${p.id}${p.tax_id ? ` · MF ${p.tax_id}` : ''}`}
            actions={
              <>
                <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                  Modifier
                </Button>
                {isCustomer && (
                  <Button icon={Plus} onClick={() => navigate(`/factures/nouvelle?client=${p.id}`)}>
                    Nouvelle facture
                  </Button>
                )}
              </>
            }
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
            <div className="card space-y-2.5 p-5">
              <h2 className="card-title mb-3">Coordonnées</h2>
              <Contact icon={Phone}>{p.phone}</Contact>
              <Contact icon={Mail}>{p.email}</Contact>
              <Contact icon={MapPin}>{p.address}</Contact>
              <Contact icon={Receipt}>{p.tax_id && `Matricule fiscal : ${p.tax_id}`}</Contact>
              <Contact icon={StickyNote}>{p.notes}</Contact>
              {!p.phone && !p.email && !p.address && !p.notes && <p className="text-sm text-ink-400">Aucune coordonnée renseignée.</p>}
            </div>

            <div className="grid grid-cols-1 content-start items-start gap-4 sm:grid-cols-3 lg:col-span-3">
              {isCustomer ? (
                <>
                  <StatCard icon={FileText} tone="violet" label="Factures confirmées" value={p.invoice_count} />
                  <StatCard icon={Receipt} label="Total facturé TTC" value={fmtMoney(p.total_invoiced)} />
                  <StatCard icon={Receipt} tone={p.balance > 0 ? 'amber' : 'gray'} label="Solde restant dû" value={fmtMoney(p.balance)} />
                </>
              ) : (
                <>
                  <StatCard icon={FileText} tone="violet" label="Produits fournis" value={p.product_count} />
                  <StatCard icon={Receipt} tone="blue" label="Entrées de stock" value={p.entry_count} />
                  <StatCard icon={Receipt} label="Total des achats" value={fmtMoney(p.total_purchased)} />
                </>
              )}
            </div>
          </div>

          <div className="mt-6">
            {isCustomer ? (
              <>
                <Tabs
                  active={tab}
                  onChange={setTab}
                  tabs={[
                    { key: 'main', label: 'Factures', count: p.invoices.length },
                    { key: 'payments', label: 'Paiements', count: p.payments.length },
                    { key: 'products', label: 'Produits achetés', count: p.top_products.length },
                  ]}
                />
                <div className="card">
                  {tab === 'main' &&
                    (p.invoices.length === 0 ? (
                      <EmptyState icon={FileText} title="Aucun achat" text="Ce client n'a pas encore de facture." />
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>N° facture</th>
                              <th>Date</th>
                              <th>État</th>
                              <th className="text-right">Total TTC</th>
                              <th className="text-right">Réglé</th>
                              <th className="text-right">Reste dû</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.invoices.map((i) => (
                              <tr key={i.id} className="row-link" onClick={() => navigate(`/factures/${i.id}`)}>
                                <td className="font-medium text-ink-900">{i.invoice_number}</td>
                                <td>{fmtDate(i.invoice_date)}</td>
                                <td>
                                  {i.status === 'cancelled' ? (
                                    <Badge color={INVOICE_STATUS.cancelled.color}>{INVOICE_STATUS.cancelled.label}</Badge>
                                  ) : (
                                    <Badge color={PAYMENT_STATUS[i.payment_status].color}>{PAYMENT_STATUS[i.payment_status].label}</Badge>
                                  )}
                                </td>
                                <td className="num font-medium text-ink-900">{fmtMoney(i.total_ttc)}</td>
                                <td className="num">{fmtMoney(i.amount_paid)}</td>
                                <td className="num">{i.status === 'cancelled' ? '—' : fmtMoney(i.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  {tab === 'payments' &&
                    (p.payments.length === 0 ? (
                      <EmptyState icon={Receipt} title="Aucun paiement enregistré" />
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Facture</th>
                              <th>Mode de paiement</th>
                              <th>Référence</th>
                              <th className="text-right">Montant</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.payments.map((pay) => (
                              <tr key={pay.id}>
                                <td>{fmtDate(pay.payment_date)}</td>
                                <td>
                                  <Link to={`/factures/${pay.invoice_id}`} className="text-brand-700 hover:underline">
                                    {pay.invoice_number}
                                  </Link>
                                </td>
                                <td>{PAYMENT_METHODS[pay.method]}</td>
                                <td>{pay.reference || '—'}</td>
                                <td className="num font-medium text-ink-900">{fmtMoney(pay.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  {tab === 'products' &&
                    (p.top_products.length === 0 ? (
                      <EmptyState title="Aucun produit acheté" />
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Produit</th>
                              <th className="text-right">Quantité totale</th>
                              <th className="text-right">Montant HT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.top_products.map((tp) => (
                              <tr key={tp.product_id} className="row-link" onClick={() => navigate(`/produits/${tp.product_id}`)}>
                                <td className="font-medium text-ink-900">{tp.description}</td>
                                <td className="num">{fmtQty(tp.quantity, tp.unit)}</td>
                                <td className="num font-medium text-ink-900">{fmtMoney(tp.total_ht)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <>
                <Tabs
                  active={tab}
                  onChange={setTab}
                  tabs={[
                    { key: 'main', label: 'Entrées de stock', count: p.entries.length },
                    { key: 'products', label: 'Produits fournis', count: p.products.length },
                  ]}
                />
                <div className="card">
                  {tab === 'main' &&
                    (p.entries.length === 0 ? (
                      <EmptyState title="Aucune entrée de stock" text="Les réceptions enregistrées avec ce fournisseur apparaîtront ici." />
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Document</th>
                              <th>Produit</th>
                              <th className="text-right">Quantité</th>
                              <th className="text-right">Coût unitaire</th>
                              <th className="text-right">Montant</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.entries.map((m) => (
                              <tr key={m.id}>
                                <td className="whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                                <td className="whitespace-nowrap">{m.reference || '—'}</td>
                                <td>
                                  <Link to={`/produits/${m.product_id}`} className="font-medium text-ink-900 hover:underline">
                                    {m.product_name}
                                  </Link>
                                  <span className="block font-mono text-xs text-ink-400">{m.sku}</span>
                                </td>
                                <td className="num">{fmtQty(m.quantity, m.unit)}</td>
                                <td className="num">{fmtMoney(m.unit_cost)}</td>
                                <td className="num font-medium text-ink-900">{fmtMoney(m.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  {tab === 'products' &&
                    (p.products.length === 0 ? (
                      <EmptyState title="Aucun produit rattaché" text="Associez ce fournisseur à un produit depuis la fiche produit." />
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Référence</th>
                              <th>Désignation</th>
                              <th className="text-right">Prix d'achat</th>
                              <th className="text-right">Stock</th>
                              <th>État</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.products.map((pr) => (
                              <tr key={pr.id} className="row-link" onClick={() => navigate(`/produits/${pr.id}`)}>
                                <td className="font-mono text-xs">{pr.sku}</td>
                                <td className="font-medium text-ink-900">{pr.name}</td>
                                <td className="num">{fmtMoney(pr.purchase_price)}</td>
                                <td className="num">{fmtQty(pr.quantity, pr.unit)}</td>
                                <td>
                                  <Badge color={stockState(pr).color}>{stockState(pr).label}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>

          <PartnerFormModal open={editing} kind={kind} partner={p} onClose={() => setEditing(false)} onSaved={reload} />
        </>
      )}
    </DataState>
  );
}
