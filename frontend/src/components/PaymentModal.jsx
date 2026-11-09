import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { errorText, fieldErrors } from '../api/client';
import { useFetch } from '../utils/hooks';
import { PAYMENT_METHODS, fmtMoney, round3, todayISO } from '../utils/format';
import { Button, Combobox, Field, Input, Modal, Select } from './ui';

/**
 * Enregistrement d'un paiement client.
 * `invoice` (facultatif) fixe la facture ; sinon l'utilisateur choisit parmi les factures non soldées.
 */
export default function PaymentModal({ open, onClose, onSaved, invoice }) {
  const [form, setForm] = useState({ invoice_id: '', amount: '', method: 'cash', payment_date: todayISO(), reference: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { data: dueList, loading: loadingDue } = useFetch(open && !invoice ? '/invoices' : null, { payment_status: 'due', limit: 500 });

  const invoices = invoice ? [invoice] : dueList?.data || [];
  const current = invoices.find((i) => String(i.id) === String(form.invoice_id));
  const balance = current ? round3(current.total_ttc - current.amount_paid) : 0;

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm({
        invoice_id: invoice?.id || '',
        amount: invoice ? String(round3(invoice.total_ttc - invoice.amount_paid)) : '',
        method: 'cash',
        payment_date: todayISO(),
        reference: '',
        notes: '',
      });
    }
  }, [open, invoice]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.invoice_id) errs.invoice_id = 'Sélectionnez une facture';
    if (!(Number(form.amount) > 0)) errs.amount = 'Le montant doit être supérieur à zéro';
    else if (current && round3(Number(form.amount)) > balance) errs.amount = `Le montant dépasse le reste à payer (${fmtMoney(balance)})`;
    if (!form.payment_date) errs.payment_date = 'Date obligatoire';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await api.post('/payments', { ...form, invoice_id: Number(form.invoice_id), amount: Number(form.amount) });
      toast.success(`Paiement de ${fmtMoney(form.amount)} enregistré`);
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "Le paiement n'a pas pu être enregistré"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement client"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} loading={saving}>
            Enregistrer le paiement
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Facture" required error={errors.invoice_id}>
          {invoice ? (
            <Input disabled value={`${invoice.invoice_number} — ${invoice.customer_name}`} />
          ) : (
            <Combobox
              value={form.invoice_id}
              error={errors.invoice_id}
              placeholder={loadingDue ? 'Chargement…' : 'Choisir une facture à régler…'}
              emptyText="Aucune facture en attente de règlement"
              onChange={(v, o) => setForm((f) => ({ ...f, invoice_id: v, amount: String(o.balance) }))}
              options={invoices.map((i) => ({
                value: i.id,
                label: `${i.invoice_number} — ${i.customer_name}`,
                sublabel: `Reste à payer : ${fmtMoney(i.total_ttc - i.amount_paid)}`,
                balance: round3(i.total_ttc - i.amount_paid),
              }))}
            />
          )}
        </Field>

        {current && (
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-ink-50 p-3 text-center text-xs">
            <div>
              <p className="text-ink-500">Total TTC</p>
              <p className="tabular mt-0.5 text-sm font-semibold text-ink-900">{fmtMoney(current.total_ttc)}</p>
            </div>
            <div>
              <p className="text-ink-500">Déjà réglé</p>
              <p className="tabular mt-0.5 text-sm font-semibold text-ink-900">{fmtMoney(current.amount_paid)}</p>
            </div>
            <div>
              <p className="text-ink-500">Reste à payer</p>
              <p className="tabular mt-0.5 text-sm font-semibold text-brand-800">{fmtMoney(balance)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Montant (DT)" required error={errors.amount}>
            <Input type="number" min="0" step="0.001" value={form.amount} onChange={set('amount')} error={errors.amount} />
          </Field>
          <Field label="Date du paiement" required error={errors.payment_date}>
            <Input type="date" value={form.payment_date} max={todayISO()} onChange={set('payment_date')} error={errors.payment_date} />
          </Field>
          <Field label="Mode de paiement" required>
            <Select value={form.method} onChange={set('method')}>
              {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Référence" hint="N° de chèque, de virement…" error={errors.reference}>
            <Input value={form.reference} onChange={set('reference')} maxLength={60} />
          </Field>
        </div>
        <Field label="Notes" error={errors.notes}>
          <Input value={form.notes} onChange={set('notes')} maxLength={255} />
        </Field>
      </form>
    </Modal>
  );
}
