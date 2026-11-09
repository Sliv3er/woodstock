import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, CreditCard, Download, Pencil, Printer, Trash2 } from 'lucide-react';
import api, { downloadFile, errorMessage, errorText } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../utils/hooks';
import { INVOICE_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, UNITS_SHORT, fmtDate, fmtDateTime, fmtMoney, fmtNumber, fmtPercent, fmtQty } from '../utils/format';
import { Badge, Button, ConfirmDialog, DataState, Field, IconButton, PageHeader, Textarea } from '../components/ui';
import PaymentModal from '../components/PaymentModal';

/** Feuille de facture : c'est cette zone (et elle seule) qui est imprimée. */
function InvoiceSheet({ inv, company, demo }) {
  const title = inv.status === 'draft' ? 'BROUILLON' : 'FACTURE';
  return (
    <div className="print-area card relative overflow-hidden p-8 sm:p-10">
      {inv.status === 'cancelled' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] rounded-xl border-4 border-red-500/40 px-8 py-2 text-6xl font-bold tracking-widest text-red-500/30">ANNULÉE</span>
        </div>
      )}

      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-brand-700 pb-5">
        <div className="text-xs leading-relaxed text-ink-500">
          <p className="text-2xl font-bold text-brand-700">{company.company_name}</p>
          {company.company_activity && <p>{company.company_activity}</p>}
          {company.company_address && <p>{company.company_address}</p>}
          {company.company_phone && <p>Tél. : {company.company_phone}</p>}
          {company.company_email && <p>{company.company_email}</p>}
          {company.company_tax_id && <p>Matricule fiscal : {company.company_tax_id}</p>}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tracking-tight text-ink-900">{title}</p>
          <p className="mt-1 text-sm font-semibold text-ink-900">N° {inv.invoice_number}</p>
          <p className="mt-1 text-xs text-ink-500">Date : {fmtDate(inv.invoice_date)}</p>
          {inv.due_date && <p className="text-xs text-ink-500">Échéance : {fmtDate(inv.due_date)}</p>}
        </div>
      </div>

      {/* Client */}
      <div className="mt-6 flex flex-wrap justify-between gap-6">
        <div className="text-xs text-ink-500">
          <p>Établie par</p>
          <p className="text-sm font-semibold text-ink-900">{inv.created_by_name}</p>
          <p className="mt-3">État du règlement</p>
          <p className="text-sm font-semibold text-ink-900">{inv.status === 'draft' ? 'Brouillon (non confirmé)' : PAYMENT_STATUS[inv.payment_status].label}</p>
        </div>
        <div className="w-full rounded-lg border border-ink-200 p-4 text-xs leading-relaxed text-ink-600 sm:w-[300px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Facturé à</p>
          <p className="mt-0.5 text-sm font-semibold text-ink-900">{inv.customer_name}</p>
          {inv.customer_address && <p>{inv.customer_address}</p>}
          {inv.customer_phone && <p>Tél. : {inv.customer_phone}</p>}
          {inv.customer_email && <p>{inv.customer_email}</p>}
          {inv.customer_tax_id && <p>Matricule fiscal : {inv.customer_tax_id}</p>}
        </div>
      </div>

      {/* Articles */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink-900 text-left text-xs text-white">
              <th className="px-3 py-2 font-semibold">Réf.</th>
              <th className="px-3 py-2 font-semibold">Désignation</th>
              <th className="px-3 py-2 text-right font-semibold">Qté</th>
              <th className="px-3 py-2 font-semibold">Unité</th>
              <th className="px-3 py-2 text-right font-semibold">P.U. HT</th>
              <th className="px-3 py-2 text-right font-semibold">Rem. %</th>
              <th className="px-3 py-2 text-right font-semibold">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it.id} className={i % 2 ? 'bg-ink-50' : ''}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-600">{it.sku}</td>
                <td className="px-3 py-2 text-ink-800">{it.description}</td>
                <td className="tabular px-3 py-2 text-right">{fmtQty(it.quantity)}</td>
                <td className="px-3 py-2 text-ink-500">{UNITS_SHORT[it.unit] || it.unit}</td>
                <td className="tabular px-3 py-2 text-right">{fmtNumber(it.unit_price)}</td>
                <td className="tabular px-3 py-2 text-right">{it.discount_percent > 0 ? fmtQty(it.discount_percent) : '—'}</td>
                <td className="tabular px-3 py-2 text-right font-medium text-ink-900">{fmtNumber(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      <div className="mt-5 flex flex-wrap justify-between gap-6 border-t border-ink-200 pt-5">
        <div className="max-w-sm text-xs text-ink-500">
          <p>Arrêtée la présente facture à la somme de :</p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{inv.amount_in_words}.</p>
          {inv.notes && (
            <>
              <p className="mt-4">Remarques :</p>
              <p className="whitespace-pre-line text-sm text-ink-700">{inv.notes}</p>
            </>
          )}
        </div>
        <dl className="ml-auto w-full space-y-1.5 text-sm sm:w-[280px]">
          <div className="flex justify-between px-2">
            <dt className="text-ink-500">Total brut HT</dt>
            <dd className="tabular">{fmtNumber(inv.subtotal)}</dd>
          </div>
          {inv.discount_amount > 0 && (
            <div className="flex justify-between px-2">
              <dt className="text-ink-500">Remise ({fmtPercent(inv.discount_percent)})</dt>
              <dd className="tabular">− {fmtNumber(inv.discount_amount)}</dd>
            </div>
          )}
          <div className="flex justify-between px-2">
            <dt className="text-ink-500">Total net HT</dt>
            <dd className="tabular">{fmtNumber(inv.total_ht)}</dd>
          </div>
          <div className="flex justify-between px-2">
            <dt className="text-ink-500">TVA ({fmtPercent(inv.vat_rate)})</dt>
            <dd className="tabular">{fmtNumber(inv.vat_amount)}</dd>
          </div>
          {inv.stamp_duty > 0 && (
            <div className="flex justify-between px-2">
              <dt className="text-ink-500">Timbre fiscal</dt>
              <dd className="tabular">{fmtNumber(inv.stamp_duty)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between rounded-md bg-brand-700 px-3 py-2 font-semibold text-white" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
            <dt>TOTAL TTC</dt>
            <dd className="tabular">{fmtMoney(inv.total_ttc)}</dd>
          </div>
          {inv.status !== 'draft' && inv.amount_paid > 0 && (
            <>
              <div className="flex justify-between px-2 pt-1">
                <dt className="text-ink-500">Montant réglé</dt>
                <dd className="tabular">{fmtMoney(inv.amount_paid)}</dd>
              </div>
              <div className="flex justify-between px-2 font-semibold text-ink-900">
                <dt>Reste à payer</dt>
                <dd className="tabular">{fmtMoney(inv.balance)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {/* Règlements */}
      {inv.payments.length > 0 && (
        <div className="mt-6 text-xs">
          <p className="mb-1.5 text-sm font-semibold text-ink-900">Règlements enregistrés</p>
          <table className="w-full max-w-lg">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-400">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 font-medium">Mode de paiement</th>
                <th className="py-1 font-medium">Référence</th>
                <th className="py-1 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id} className="text-ink-700">
                  <td className="py-1">{fmtDate(p.payment_date)}</td>
                  <td className="py-1">{PAYMENT_METHODS[p.method]}</td>
                  <td className="py-1">{p.reference || '—'}</td>
                  <td className="tabular py-1 text-right">{fmtMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <div className="w-52 text-center text-xs text-ink-400">
          Cachet et signature
          <div className="mt-1.5 h-16 rounded-lg border border-dashed border-ink-300" />
        </div>
      </div>

      <div className="mt-8 border-t border-ink-200 pt-3 text-center text-[11px] leading-relaxed text-ink-400">
        <p>
          {[company.company_name, company.company_tax_id && `MF : ${company.company_tax_id}`, company.company_rib && `RIB : ${company.company_rib}`].filter(Boolean).join('  •  ')}
        </p>
        {company.invoice_footer && <p>{company.invoice_footer}</p>}
        <p>Document généré par WoodStock — modèle de facture non certifié fiscalement.{demo ? ' Données de démonstration.' : ''}</p>
      </div>
    </div>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: inv, loading, error, reload } = useFetch(`/invoices/${id}`);
  const { data: settings } = useFetch('/settings');

  const [dialog, setDialog] = useState(null); // 'confirm' | 'cancel' | 'delete' | { payment }
  const [paying, setPaying] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setDialog(null);
      return true;
    } catch (err) {
      toast.error(errorText(err, "L'opération a échoué"), { duration: 8000 });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => (await run(() => api.post(`/invoices/${id}/confirm`), 'Facture confirmée — stock mis à jour')) && reload();
  const cancel = async () => (await run(() => api.post(`/invoices/${id}/cancel`, { reason }), inv.status === 'confirmed' ? 'Facture annulée — stock ré-intégré' : 'Brouillon annulé')) && reload();
  const remove = async () => (await run(() => api.delete(`/invoices/${id}`), 'Brouillon supprimé')) && navigate('/factures', { replace: true });
  const removePayment = async () => (await run(() => api.delete(`/payments/${dialog.payment.id}`), 'Paiement supprimé')) && reload();

  const pdf = async () => {
    try {
      await downloadFile(`/invoices/${id}/pdf`);
    } catch (err) {
      toast.error(await errorMessage(err, 'Le PDF n’a pas pu être généré'));
    }
  };

  const shortages = inv?.status === 'draft' ? inv.items.filter((it) => it.quantity > it.stock_quantity) : [];

  return (
    <DataState loading={loading && !inv} error={error} onRetry={reload}>
      {inv && settings && (
        <>
          <PageHeader
            back={
              <Link to="/factures" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
                <ArrowLeft className="h-3.5 w-3.5" /> Facturation
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-2.5">
                {inv.invoice_number}
                <Badge color={INVOICE_STATUS[inv.status].color}>{INVOICE_STATUS[inv.status].label}</Badge>
                {inv.status === 'confirmed' && <Badge color={PAYMENT_STATUS[inv.payment_status].color}>{PAYMENT_STATUS[inv.payment_status].label}</Badge>}
              </span>
            }
            subtitle={
              <>
                <Link to={`/clients/${inv.customer_id}`} className="hover:underline">
                  {inv.customer_name}
                </Link>{' '}
                · {fmtDate(inv.invoice_date)}
              </>
            }
            actions={
              <>
                {inv.status === 'draft' && (
                  <>
                    <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/factures/${id}/modifier`)}>
                      Modifier
                    </Button>
                    <Button icon={CheckCircle2} disabled={shortages.length > 0} onClick={() => setDialog('confirm')}>
                      Confirmer
                    </Button>
                  </>
                )}
                {inv.status === 'confirmed' && inv.balance > 0 && (
                  <Button icon={CreditCard} onClick={() => setPaying(true)}>
                    Enregistrer un paiement
                  </Button>
                )}
                <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                  Imprimer
                </Button>
                <Button variant="secondary" icon={Download} onClick={pdf}>
                  PDF
                </Button>
              </>
            }
          />

          {shortages.length > 0 && (
            <div className="no-print mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Confirmation impossible : stock insuffisant</p>
                <ul className="mt-0.5 list-inside list-disc">
                  {shortages.map((s) => (
                    <li key={s.id}>
                      {s.description} — demandé {fmtQty(s.quantity, s.unit)}, disponible {fmtQty(s.stock_quantity, s.unit)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <InvoiceSheet inv={inv} company={settings.company} demo={settings.demo_mode} />

            {/* Panneau latéral (non imprimé) */}
            <div className="no-print space-y-5">
              {inv.status !== 'draft' && (
                <div className="card p-5">
                  <h2 className="card-title mb-3">Règlement</h2>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Total TTC</dt>
                      <dd className="tabular font-medium text-ink-900">{fmtMoney(inv.total_ttc)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Réglé</dt>
                      <dd className="tabular text-brand-800">{fmtMoney(inv.amount_paid)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-ink-100 pt-2">
                      <dt className="font-medium text-ink-900">Reste à payer</dt>
                      <dd className="tabular font-semibold text-ink-900">{inv.status === 'cancelled' ? '—' : fmtMoney(inv.balance)}</dd>
                    </div>
                  </dl>
                  {inv.status === 'confirmed' && (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${inv.total_ttc > 0 ? Math.min(100, (inv.amount_paid / inv.total_ttc) * 100) : 100}%` }} />
                    </div>
                  )}

                  {inv.payments.length > 0 && (
                    <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
                      {inv.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                          <div className="min-w-0">
                            <p className="tabular text-sm font-medium text-ink-900">{fmtMoney(p.amount)}</p>
                            <p className="truncate text-xs text-ink-500">
                              {fmtDate(p.payment_date)} · {PAYMENT_METHODS[p.method]}
                              {p.reference ? ` · ${p.reference}` : ''}
                            </p>
                          </div>
                          {isAdmin && <IconButton icon={Trash2} label="Supprimer ce paiement" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDialog({ payment: p })} />}
                        </li>
                      ))}
                    </ul>
                  )}
                  {inv.status === 'confirmed' && inv.payments.length === 0 && <p className="mt-3 text-xs text-ink-400">Aucun paiement enregistré pour cette facture.</p>}
                </div>
              )}

              <div className="card p-5">
                <h2 className="card-title mb-3">Suivi du document</h2>
                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs text-ink-500">Créée le</dt>
                    <dd className="text-ink-800">
                      {fmtDateTime(inv.created_at)} par {inv.created_by_name}
                    </dd>
                  </div>
                  {inv.confirmed_at && (
                    <div>
                      <dt className="text-xs text-ink-500">Confirmée le</dt>
                      <dd className="text-ink-800">{fmtDateTime(inv.confirmed_at)} — stock déduit</dd>
                    </div>
                  )}
                  {inv.cancelled_at && (
                    <div>
                      <dt className="text-xs text-ink-500">Annulée le</dt>
                      <dd className="text-ink-800">
                        {fmtDateTime(inv.cancelled_at)}
                        {inv.confirmed_at ? ' — stock ré-intégré' : ''}
                      </dd>
                      {inv.cancel_reason && <dd className="mt-0.5 text-xs text-ink-500">Motif : {inv.cancel_reason}</dd>}
                    </div>
                  )}
                </dl>
                {inv.confirmed_at && (
                  <Link to={`/transactions?recherche=${encodeURIComponent(inv.invoice_number)}`} className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline">
                    Voir les écritures liées dans le journal
                  </Link>
                )}
              </div>

              {inv.status === 'draft' && (
                <Button variant="secondary" icon={Trash2} className="w-full !text-red-600" onClick={() => setDialog('delete')}>
                  Supprimer le brouillon
                </Button>
              )}
              {inv.status === 'confirmed' && isAdmin && (
                <Button
                  variant="secondary"
                  icon={Ban}
                  className="w-full !text-red-600"
                  onClick={() => {
                    setReason('');
                    setDialog('cancel');
                  }}
                >
                  Annuler la facture
                </Button>
              )}
            </div>
          </div>

          <PaymentModal open={paying} invoice={inv} onClose={() => setPaying(false)} onSaved={reload} />

          <ConfirmDialog
            open={dialog === 'confirm'}
            danger={false}
            title="Confirmer la facture ?"
            message={`La facture de ${fmtMoney(inv.total_ttc)} recevra son numéro définitif et les quantités vendues seront déduites du stock.`}
            confirmLabel="Confirmer la facture"
            loading={busy}
            onConfirm={confirm}
            onClose={() => setDialog(null)}
          />
          <ConfirmDialog open={dialog === 'delete'} title="Supprimer ce brouillon ?" message="Le brouillon sera définitivement supprimé. Cette action est sans effet sur le stock." confirmLabel="Supprimer" loading={busy} onConfirm={remove} onClose={() => setDialog(null)} />
          <ConfirmDialog
            open={dialog === 'cancel'}
            title={`Annuler la facture ${inv.invoice_number} ?`}
            message="Les quantités vendues seront ré-intégrées au stock et la vente sera contre-passée dans le journal. Cette action est définitive."
            confirmLabel="Annuler la facture"
            loading={busy}
            onConfirm={cancel}
            onClose={() => setDialog(null)}
          >
            {inv.amount_paid > 0 && <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">Cette facture a des paiements enregistrés : supprimez-les d'abord (remboursement du client).</p>}
            <Field label="Motif de l'annulation" className="mt-3">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} rows={2} placeholder="Ex. commande annulée par le client" />
            </Field>
          </ConfirmDialog>
          <ConfirmDialog
            open={Boolean(dialog?.payment)}
            title="Supprimer ce paiement ?"
            message={dialog?.payment ? `Le paiement de ${fmtMoney(dialog.payment.amount)} du ${fmtDate(dialog.payment.payment_date)} sera supprimé et le solde de la facture recalculé.` : ''}
            confirmLabel="Supprimer le paiement"
            loading={busy}
            onConfirm={removePayment}
            onClose={() => setDialog(null)}
          />
        </>
      )}
    </DataState>
  );
}
