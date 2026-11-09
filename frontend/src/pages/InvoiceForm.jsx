import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, Save, Trash2, UserPlus } from 'lucide-react';
import api, { errorText } from '../api/client';
import { useFetch } from '../utils/hooks';
import { UNITS_SHORT, addDaysISO, fmtMoney, fmtNumber, fmtPercent, fmtQty, round3, todayISO } from '../utils/format';
import { Button, Combobox, ConfirmDialog, DataState, Field, IconButton, Input, PageHeader, Select, Textarea } from '../components/ui';
import PartnerFormModal from '../components/PartnerFormModal';

let lineKey = 0;
const newLine = () => ({ key: ++lineKey, product_id: '', quantity: '1', unit_price: '', discount_percent: '0' });

/** Création d'une facture ou modification d'un brouillon. */
export default function InvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = Boolean(id);

  const { data: customers, reload: reloadCustomers } = useFetch('/customers', { limit: 1000 });
  const { data: productList } = useFetch('/products', { limit: 1000, sort: 'name' });
  const { data: settings } = useFetch('/settings');
  const { data: existing, loading: loadingInvoice, error: invoiceError } = useFetch(editing ? `/invoices/${id}` : null);

  const [form, setForm] = useState({
    customer_id: params.get('client') || '',
    invoice_date: todayISO(),
    due_date: addDaysISO(todayISO(), 30),
    discount_percent: '0',
    vat_rate: '',
    apply_stamp: true,
    notes: '',
  });
  const [lines, setLines] = useState([newLine()]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null); // 'draft' | 'confirm'
  const [confirming, setConfirming] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);

  const products = useMemo(() => productList?.data || [], [productList]);
  const productById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  // Taux de TVA par défaut (paramètres)
  useEffect(() => {
    if (settings && !editing && form.vat_rate === '') {
      const def = settings.vat_rates.find((v) => v.is_default) || settings.vat_rates[0];
      if (def) setForm((f) => ({ ...f, vat_rate: String(def.rate) }));
    }
  }, [settings, editing, form.vat_rate]);

  // Chargement du brouillon à modifier
  useEffect(() => {
    if (!existing) return;
    if (existing.status !== 'draft') {
      toast.error('Seul un brouillon peut être modifié');
      navigate(`/factures/${id}`, { replace: true });
      return;
    }
    setForm({
      customer_id: String(existing.customer_id),
      invoice_date: existing.invoice_date,
      due_date: existing.due_date || '',
      discount_percent: String(existing.discount_percent),
      vat_rate: String(existing.vat_rate),
      apply_stamp: existing.stamp_duty > 0,
      notes: existing.notes || '',
    });
    setLines(
      existing.items.map((it) => ({
        key: ++lineKey,
        product_id: String(it.product_id),
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
        discount_percent: String(it.discount_percent),
      }))
    );
  }, [existing, id, navigate]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));

  // ---- Calculs (mêmes règles que le serveur, qui reste la référence) ----
  const stampDuty = form.apply_stamp ? Number(settings?.stamp_duty || 0) : 0;
  const computed = useMemo(() => {
    const rows = lines.map((l) => {
      const product = productById.get(String(l.product_id));
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const disc = Number(l.discount_percent) || 0;
      return { ...l, product, total: round3(qty * price * (1 - disc / 100)), shortage: product ? qty > Number(product.quantity) : false };
    });
    const subtotal = round3(rows.reduce((s, r) => s + r.total, 0));
    const discount = round3((subtotal * (Number(form.discount_percent) || 0)) / 100);
    const totalHt = round3(subtotal - discount);
    const vat = round3((totalHt * (Number(form.vat_rate) || 0)) / 100);
    return { rows, subtotal, discount, totalHt, vat, total: round3(totalHt + vat + stampDuty) };
  }, [lines, productById, form.discount_percent, form.vat_rate, stampDuty]);

  const shortages = computed.rows.filter((r) => r.shortage);
  const usedProducts = new Set(lines.map((l) => String(l.product_id)).filter(Boolean));

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Sélectionnez un client';
    if (!form.invoice_date) e.invoice_date = 'Date obligatoire';
    if (form.due_date && form.due_date < form.invoice_date) e.due_date = "L'échéance ne peut pas précéder la date de facture";
    if (form.vat_rate === '') e.vat_rate = 'Sélectionnez un taux de TVA';
    const d = Number(form.discount_percent);
    if (Number.isNaN(d) || d < 0 || d > 100) e.discount_percent = 'Entre 0 et 100';
    lines.forEach((l) => {
      if (!l.product_id) e[`line_${l.key}`] = 'Choisissez un produit';
      else if (!(Number(l.quantity) > 0)) e[`line_${l.key}`] = 'Quantité invalide';
      else if (l.unit_price === '' || Number(l.unit_price) < 0) e[`line_${l.key}`] = 'Prix invalide';
      else if (Number(l.discount_percent) < 0 || Number(l.discount_percent) > 100) e[`line_${l.key}`] = 'Remise entre 0 et 100 %';
    });
    setErrors(e);
    if (Object.keys(e).length) toast.error('Veuillez corriger les champs signalés');
    return Object.keys(e).length === 0;
  };

  const save = async (confirm) => {
    setSaving(confirm ? 'confirm' : 'draft');
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        discount_percent: Number(form.discount_percent) || 0,
        vat_rate: Number(form.vat_rate),
        stamp_duty: stampDuty,
        notes: form.notes,
        confirm,
        items: lines.map((l) => ({
          product_id: Number(l.product_id),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          discount_percent: Number(l.discount_percent) || 0,
        })),
      };
      const { data } = editing ? await api.put(`/invoices/${id}`, payload) : await api.post('/invoices', payload);
      toast.success(confirm ? `Facture ${data.invoice_number} confirmée — stock mis à jour` : 'Brouillon enregistré');
      navigate(`/factures/${data.id}`, { replace: true });
    } catch (err) {
      toast.error(errorText(err, "La facture n'a pas pu être enregistrée"), { duration: 8000 });
    } finally {
      setSaving(null);
      setConfirming(false);
    }
  };

  const ready = customers && productList && settings && (!editing || existing);

  return (
    <DataState loading={!ready && !invoiceError} error={invoiceError}>
      <PageHeader
        back={
          <Link to={editing ? `/factures/${id}` : '/factures'} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
            <ArrowLeft className="h-3.5 w-3.5" /> {editing ? 'Retour à la facture' : 'Facturation'}
          </Link>
        }
        title={editing ? `Modifier le brouillon ${existing?.invoice_number || ''}` : 'Nouvelle facture'}
        subtitle="Le stock n'est déduit qu'à la confirmation de la facture"
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* En-tête */}
          <div className="card p-5">
            <h2 className="card-title mb-4">Client et dates</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Client" required error={errors.customer_id} className="sm:col-span-2">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Combobox
                      value={form.customer_id}
                      error={errors.customer_id}
                      placeholder="Choisir un client…"
                      onChange={(v) => setForm((f) => ({ ...f, customer_id: String(v) }))}
                      options={(customers?.data || []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.phone, c.tax_id && `MF ${c.tax_id}`].filter(Boolean).join(' · ') }))}
                    />
                  </div>
                  <Button variant="secondary" icon={UserPlus} onClick={() => setAddingCustomer(true)}>
                    Nouveau
                  </Button>
                </div>
              </Field>
              <Field label="Date de facture" required error={errors.invoice_date}>
                <Input type="date" value={form.invoice_date} onChange={set('invoice_date')} error={errors.invoice_date} />
              </Field>
              <Field label="Date d'échéance" error={errors.due_date}>
                <Input type="date" value={form.due_date} min={form.invoice_date} onChange={set('due_date')} error={errors.due_date} />
              </Field>
            </div>
          </div>

          {/* Lignes */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Articles</h2>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, newLine()])}>
                Ajouter une ligne
              </Button>
            </div>
            <div className="overflow-visible">
              <table className="table min-w-[640px] table-fixed [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th className="w-[132px] text-right">Quantité</th>
                    <th className="w-[112px] text-right">P.U. HT (DT)</th>
                    <th className="w-[84px] text-right">Remise %</th>
                    <th className="w-[112px] text-right">Total HT</th>
                    <th className="w-[48px]" />
                  </tr>
                </thead>
                <tbody>
                  {computed.rows.map((l) => (
                    <tr key={l.key} className="align-top">
                      <td>
                        <Combobox
                          value={l.product_id}
                          error={errors[`line_${l.key}`] && !l.product_id}
                          placeholder="Choisir un produit…"
                          onChange={(v, o) => updateLine(l.key, { product_id: String(v), unit_price: String(o.price) })}
                          options={products.map((p) => ({
                            value: p.id,
                            label: p.name,
                            sublabel: `${p.sku} · ${fmtNumber(p.selling_price)} DT · stock : ${fmtQty(p.quantity, p.unit)}`,
                            price: p.selling_price,
                            disabled: usedProducts.has(String(p.id)) && String(p.id) !== String(l.product_id),
                          }))}
                        />
                        {l.product && (
                          <p className={`mt-1 flex items-center gap-1 text-xs ${l.shortage ? 'font-medium text-red-600' : 'text-ink-400'}`}>
                            {l.shortage && <AlertTriangle className="h-3.5 w-3.5" />}
                            {l.product.sku} · en stock : {fmtQty(l.product.quantity, l.product.unit)}
                            {l.shortage && ' — quantité insuffisante'}
                          </p>
                        )}
                        {errors[`line_${l.key}`] && <p className="mt-1 text-xs text-red-600">{errors[`line_${l.key}`]}</p>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <Input type="number" min="0" step="any" className="!w-20 text-right" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} aria-label="Quantité" />
                          <span className="w-7 shrink-0 text-xs text-ink-400">{l.product ? UNITS_SHORT[l.product.unit] : ''}</span>
                        </div>
                      </td>
                      <td>
                        <Input type="number" min="0" step="0.001" className="ml-auto !w-24 text-right" value={l.unit_price} onChange={(e) => updateLine(l.key, { unit_price: e.target.value })} aria-label="Prix unitaire" />
                      </td>
                      <td>
                        <Input type="number" min="0" max="100" step="any" className="ml-auto !w-16 text-right" value={l.discount_percent} onChange={(e) => updateLine(l.key, { discount_percent: e.target.value })} aria-label="Remise" />
                      </td>
                      <td className="num pt-4 font-medium text-ink-900">{fmtNumber(l.total)}</td>
                      <td className="pt-3">
                        <IconButton icon={Trash2} label="Retirer la ligne" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => removeLine(l.key)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <Field label="Remarques (imprimées sur la facture)">
              <Textarea value={form.notes} onChange={set('notes')} maxLength={2000} rows={2} placeholder="Conditions de règlement, mention de livraison…" />
            </Field>
          </div>
        </div>

        {/* Récapitulatif */}
        <div className="space-y-5">
          <div className="card p-5 xl:sticky xl:top-6">
            <h2 className="card-title mb-4">Récapitulatif</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Remise globale (%)" error={errors.discount_percent}>
                <Input type="number" min="0" max="100" step="any" value={form.discount_percent} onChange={set('discount_percent')} error={errors.discount_percent} />
              </Field>
              <Field label="TVA" required error={errors.vat_rate}>
                <Select value={form.vat_rate} onChange={set('vat_rate')} error={errors.vat_rate}>
                  {form.vat_rate !== '' && !settings?.vat_rates.some((v) => Number(v.rate) === Number(form.vat_rate)) && <option value={form.vat_rate}>{fmtPercent(form.vat_rate)}</option>}
                  {(settings?.vat_rates || []).map((v) => (
                    <option key={v.id} value={v.rate}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-600" checked={form.apply_stamp} onChange={(e) => setForm((f) => ({ ...f, apply_stamp: e.target.checked }))} />
              Appliquer le timbre fiscal ({fmtMoney(settings?.stamp_duty || 0)})
            </label>

            <dl className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Total brut HT</dt>
                <dd className="tabular">{fmtMoney(computed.subtotal)}</dd>
              </div>
              {computed.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Remise ({fmtPercent(form.discount_percent)})</dt>
                  <dd className="tabular text-red-600">− {fmtMoney(computed.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-500">Total net HT</dt>
                <dd className="tabular font-medium text-ink-900">{fmtMoney(computed.totalHt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">TVA ({fmtPercent(form.vat_rate || 0)})</dt>
                <dd className="tabular">{fmtMoney(computed.vat)}</dd>
              </div>
              {stampDuty > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">Timbre fiscal</dt>
                  <dd className="tabular">{fmtMoney(stampDuty)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-brand-700 px-3 py-2.5 text-white">
                <dt className="font-semibold">Total TTC</dt>
                <dd className="tabular text-lg font-semibold">{fmtMoney(computed.total)}</dd>
              </div>
            </dl>

            {shortages.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Stock insuffisant
                </p>
                <ul className="mt-1 list-inside list-disc">
                  {shortages.map((s) => (
                    <li key={s.key}>
                      {s.product.name} : {fmtQty(s.product.quantity, s.product.unit)} disponibles
                    </li>
                  ))}
                </ul>
                <p className="mt-1">La facture peut être enregistrée en brouillon, mais pas confirmée.</p>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <Button icon={CheckCircle2} className="w-full" disabled={shortages.length > 0 || Boolean(saving)} onClick={() => validate() && setConfirming(true)}>
                Enregistrer et confirmer
              </Button>
              <Button variant="secondary" icon={Save} className="w-full" loading={saving === 'draft'} disabled={Boolean(saving)} onClick={() => validate() && save(false)}>
                Enregistrer comme brouillon
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        danger={false}
        title="Confirmer la facture ?"
        message={`La facture de ${fmtMoney(computed.total)} recevra son numéro définitif et les quantités vendues seront déduites du stock.`}
        confirmLabel="Confirmer la facture"
        loading={saving === 'confirm'}
        onConfirm={() => save(true)}
        onClose={() => setConfirming(false)}
      >
        <p className="mt-2 text-xs text-ink-500">Une facture confirmée ne peut plus être modifiée ; elle peut seulement être annulée par un administrateur.</p>
      </ConfirmDialog>

      <PartnerFormModal
        open={addingCustomer}
        kind="customers"
        onClose={() => setAddingCustomer(false)}
        onSaved={(created) => {
          reloadCustomers();
          if (created?.id) setForm((f) => ({ ...f, customer_id: String(created.id) }));
        }}
      />
    </DataState>
  );
}
