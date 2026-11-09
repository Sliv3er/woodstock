import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { errorText, fieldErrors } from '../api/client';
import { useFetch } from '../utils/hooks';
import { UNITS, fmtQty } from '../utils/format';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

const EMPTY = { sku: '', name: '', category_id: '', description: '', unit: 'piece', purchase_price: '', selling_price: '', min_stock: '0', supplier_id: '', initial_quantity: '0' };

/** Création / modification d'un produit. */
export default function ProductFormModal({ open, product, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { data: categories } = useFetch(open ? '/categories' : null);
  const { data: suppliers } = useFetch(open ? '/suppliers' : null, { limit: 1000 });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      product
        ? {
            sku: product.sku,
            name: product.name,
            category_id: product.category_id,
            description: product.description || '',
            unit: product.unit,
            purchase_price: String(product.purchase_price),
            selling_price: String(product.selling_price),
            min_stock: String(product.min_stock),
            supplier_id: product.supplier_id || '',
          }
        : EMPTY
    );
  }, [open, product]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.sku.trim()) e.sku = 'Champ obligatoire';
    else if (!/^[A-Za-z0-9._/-]+$/.test(form.sku.trim())) e.sku = 'Lettres, chiffres, tiret, point uniquement';
    if (!form.name.trim()) e.name = 'Champ obligatoire';
    if (!form.category_id) e.category_id = 'Sélectionnez une catégorie';
    for (const f of ['purchase_price', 'selling_price', 'min_stock']) {
      if (form[f] === '' || Number(form[f]) < 0 || Number.isNaN(Number(form[f]))) e[f] = 'Valeur numérique ≥ 0 requise';
    }
    if (!product && (Number(form.initial_quantity) < 0 || Number.isNaN(Number(form.initial_quantity)))) e.initial_quantity = 'Valeur numérique ≥ 0 requise';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (product) {
        await api.put(`/products/${product.id}`, form);
        toast.success('Produit mis à jour');
      } else {
        await api.post('/products', { ...form, initial_quantity: form.initial_quantity || 0 });
        toast.success('Produit ajouté au catalogue');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "Le produit n'a pas pu être enregistré"));
    } finally {
      setSaving(false);
    }
  };

  const margin = Number(form.purchase_price) > 0 && form.selling_price !== '' ? ((Number(form.selling_price) - Number(form.purchase_price)) / Number(form.purchase_price)) * 100 : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? 'Modifier le produit' : 'Nouveau produit'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} loading={saving}>
            {product ? 'Enregistrer' : 'Ajouter le produit'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6" noValidate>
        <Field label="Référence (SKU)" required error={errors.sku} className="sm:col-span-2">
          <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))} maxLength={40} error={errors.sku} placeholder="MDF-18" />
        </Field>
        <Field label="Désignation" required error={errors.name} className="sm:col-span-4">
          <Input value={form.name} onChange={set('name')} maxLength={160} error={errors.name} placeholder="MDF brut 18 mm (1220 × 2440)" />
        </Field>

        <Field label="Catégorie" required error={errors.category_id} className="sm:col-span-2">
          <Select value={form.category_id} onChange={set('category_id')} error={errors.category_id}>
            <option value="">— Choisir —</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unité de mesure" required className="sm:col-span-2">
          <Select value={form.unit} onChange={set('unit')}>
            {Object.entries(UNITS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fournisseur" className="sm:col-span-2">
          <Select value={form.supplier_id} onChange={set('supplier_id')}>
            <option value="">— Aucun —</option>
            {(suppliers?.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Prix d'achat HT (DT)" required error={errors.purchase_price} className="sm:col-span-2">
          <Input type="number" min="0" step="0.001" value={form.purchase_price} onChange={set('purchase_price')} error={errors.purchase_price} />
        </Field>
        <Field
          label="Prix de vente HT (DT)"
          required
          error={errors.selling_price}
          hint={margin != null ? `Marge sur coût : ${margin.toFixed(1).replace('.', ',')} %` : undefined}
          className="sm:col-span-2"
        >
          <Input type="number" min="0" step="0.001" value={form.selling_price} onChange={set('selling_price')} error={errors.selling_price} />
        </Field>
        <Field label="Seuil minimum de stock" required error={errors.min_stock} hint="Alerte « stock faible » en dessous" className="sm:col-span-2">
          <Input type="number" min="0" step="any" value={form.min_stock} onChange={set('min_stock')} error={errors.min_stock} />
        </Field>

        {product ? (
          <div className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-500 sm:col-span-6">
            Stock actuel : <strong className="text-ink-800">{fmtQty(product.quantity, product.unit)}</strong>. La quantité se modifie uniquement par un mouvement de stock (entrée, sortie ou ajustement) afin de conserver
            l'historique.
          </div>
        ) : (
          <Field label="Stock initial" error={errors.initial_quantity} hint="Enregistré comme mouvement d'entrée" className="sm:col-span-2">
            <Input type="number" min="0" step="any" value={form.initial_quantity} onChange={set('initial_quantity')} error={errors.initial_quantity} />
          </Field>
        )}

        <Field label="Description" error={errors.description} className="sm:col-span-6">
          <Textarea value={form.description} onChange={set('description')} maxLength={2000} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
