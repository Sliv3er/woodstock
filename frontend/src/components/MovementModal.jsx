import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import api, { errorText, fieldErrors } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../utils/hooks';
import { UNITS, fmtNumber, fmtQty, round3, uuid } from '../utils/format';
import { Button, Combobox, Field, Input, Modal, Select, Textarea, cx } from './ui';

const TYPES = [
  { key: 'IN', label: 'Entrée', hint: 'Réception fournisseur, retour…', icon: ArrowDownLeft, active: 'border-brand-600 bg-brand-50 text-brand-800' },
  { key: 'OUT', label: 'Sortie', hint: 'Casse, usage interne…', icon: ArrowUpRight, active: 'border-red-500 bg-red-50 text-red-700' },
  { key: 'ADJUSTMENT', label: 'Ajustement', hint: 'Correction après inventaire', icon: SlidersHorizontal, active: 'border-amber-500 bg-amber-50 text-amber-800', adminOnly: true },
];

const empty = (type, productId) => ({ type, product_id: productId || '', quantity: '', new_quantity: '', unit_cost: '', supplier_id: '', reference: '', notes: '' });

/**
 * Saisie d'un mouvement de stock.
 * `product` (facultatif) pré-sélectionne et verrouille le produit.
 */
export default function MovementModal({ open, onClose, onSaved, product, defaultType = 'IN' }) {
  const { isAdmin } = useAuth();
  const [form, setForm] = useState(empty(defaultType, product?.id));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState('');

  const { data: productList } = useFetch(open && !product ? '/products' : null, { limit: 1000, sort: 'name' });
  const { data: supplierList } = useFetch(open ? '/suppliers' : null, { limit: 1000 });

  // Nouvelle clé d'idempotence à chaque ouverture : un double clic ne crée pas deux mouvements
  useEffect(() => {
    if (open) {
      setForm(empty(defaultType, product?.id));
      setErrors({});
      setKey(uuid());
    }
  }, [open, defaultType, product?.id]);

  const products = product ? [product] : productList?.data || [];
  const current = products.find((p) => String(p.id) === String(form.product_id));
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Aperçu du stock après le mouvement
  const preview = useMemo(() => {
    if (!current) return null;
    const stock = Number(current.quantity);
    if (form.type === 'ADJUSTMENT') return form.new_quantity === '' ? null : round3(Number(form.new_quantity));
    if (form.quantity === '' || !(Number(form.quantity) > 0)) return null;
    return round3(form.type === 'IN' ? stock + Number(form.quantity) : stock - Number(form.quantity));
  }, [current, form.type, form.quantity, form.new_quantity]);

  const validate = () => {
    const e = {};
    if (!form.product_id) e.product_id = 'Sélectionnez un produit';
    if (form.type === 'ADJUSTMENT') {
      if (form.new_quantity === '' || Number(form.new_quantity) < 0) e.new_quantity = 'Indiquez la quantité réelle (≥ 0)';
      else if (current && Number(form.new_quantity) === Number(current.quantity)) e.new_quantity = 'Identique au stock actuel : aucun écart à enregistrer';
      if (!form.notes.trim()) e.notes = "Le motif de l'ajustement est obligatoire";
    } else {
      if (!(Number(form.quantity) > 0)) e.quantity = 'La quantité doit être supérieure à zéro';
      else if (form.type === 'OUT' && current && Number(form.quantity) > Number(current.quantity)) {
        e.quantity = `Stock insuffisant : ${fmtQty(current.quantity, current.unit)} disponibles`;
      }
    }
    if (form.type === 'IN' && form.unit_cost !== '' && Number(form.unit_cost) < 0) e.unit_cost = 'Valeur invalide';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        product_id: Number(form.product_id),
        type: form.type,
        reference: form.reference,
        notes: form.notes,
        idempotency_key: key,
        ...(form.type === 'ADJUSTMENT' ? { new_quantity: Number(form.new_quantity) } : { quantity: Number(form.quantity) }),
        ...(form.type === 'IN' ? { unit_cost: form.unit_cost, supplier_id: form.supplier_id } : {}),
      };
      const { data } = await api.post('/stock/movements', payload);
      toast.success(`Mouvement enregistré — stock : ${fmtQty(data.previous_quantity)} → ${fmtQty(data.new_quantity)}`);
      onSaved?.(data);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "Le mouvement n'a pas pu être enregistré"));
      setKey(uuid());
    } finally {
      setSaving(false);
    }
  };

  const types = TYPES.filter((t) => !t.adminOnly || isAdmin);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouveau mouvement de stock"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} loading={saving}>
            Enregistrer le mouvement
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className={cx('grid gap-2', types.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, type: t.key }));
                setErrors({});
              }}
              className={cx('rounded-lg border px-3 py-2.5 text-left transition', form.type === t.key ? t.active : 'border-ink-200 text-ink-600 hover:bg-ink-50')}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <t.icon className="h-4 w-4" /> {t.label}
              </span>
              <span className="mt-0.5 block text-xs opacity-80">{t.hint}</span>
            </button>
          ))}
        </div>

        <Field label="Produit" required error={errors.product_id}>
          {product ? (
            <Input value={`${product.sku} — ${product.name}`} disabled />
          ) : (
            <Combobox
              value={form.product_id}
              onChange={(v) => setForm((f) => ({ ...f, product_id: v }))}
              error={errors.product_id}
              placeholder="Choisir un produit…"
              options={products.map((p) => ({ value: p.id, label: p.name, sublabel: `${p.sku} · en stock : ${fmtQty(p.quantity, p.unit)}` }))}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {form.type === 'ADJUSTMENT' ? (
            <Field label="Quantité réelle constatée" required error={errors.new_quantity} hint="Quantité comptée lors de l'inventaire">
              <Input type="number" min="0" step="any" value={form.new_quantity} onChange={set('new_quantity')} error={errors.new_quantity} />
            </Field>
          ) : (
            <Field label={`Quantité${current ? ` (${UNITS[current.unit].toLowerCase()})` : ''}`} required error={errors.quantity}>
              <Input type="number" min="0" step="any" value={form.quantity} onChange={set('quantity')} error={errors.quantity} />
            </Field>
          )}

          {/* Aperçu avant / après */}
          <div>
            <span className="label">Stock avant → après</span>
            <div className="flex h-[38px] items-center gap-2 rounded-lg border border-dashed border-ink-200 bg-ink-50 px-3 text-sm">
              {current ? (
                <>
                  <span className="tabular font-medium text-ink-700">{fmtQty(current.quantity, current.unit)}</span>
                  <ArrowRight className="h-4 w-4 text-ink-400" />
                  <span className={cx('tabular font-semibold', preview == null ? 'text-ink-400' : preview < 0 ? 'text-red-600' : 'text-brand-800')}>
                    {preview == null ? '—' : fmtQty(preview, current.unit)}
                  </span>
                </>
              ) : (
                <span className="text-ink-400">Sélectionnez un produit</span>
              )}
            </div>
          </div>
        </div>

        {form.type === 'IN' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fournisseur" hint="Renseigné : le mouvement est enregistré comme achat">
              <Select value={form.supplier_id} onChange={set('supplier_id')}>
                <option value="">— Aucun —</option>
                {(supplierList?.data || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Coût unitaire d'achat (DT)" error={errors.unit_cost} hint={current ? `Actuel : ${fmtNumber(current.purchase_price)} DT — mis à jour si renseigné` : undefined}>
              <Input type="number" min="0" step="0.001" value={form.unit_cost} onChange={set('unit_cost')} error={errors.unit_cost} placeholder="Facultatif" />
            </Field>
          </div>
        )}

        <Field label="Référence / n° de document" error={errors.reference} hint="Bon de livraison, bon de sortie, n° d'inventaire…">
          <Input value={form.reference} onChange={set('reference')} maxLength={60} placeholder="Ex. BL-2026-016" />
        </Field>
        <Field label={form.type === 'ADJUSTMENT' ? "Motif de l'ajustement" : 'Notes'} required={form.type === 'ADJUSTMENT'} error={errors.notes}>
          <Textarea value={form.notes} onChange={set('notes')} maxLength={500} rows={2} error={errors.notes} />
        </Field>
      </form>
    </Modal>
  );
}
