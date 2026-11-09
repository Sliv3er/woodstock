import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { errorText, fieldErrors } from '../api/client';
import { Button, Field, Input, Modal, Textarea } from './ui';

const EMPTY = { name: '', phone: '', email: '', address: '', tax_id: '', notes: '' };

/** Création / modification d'un client ou d'un fournisseur. */
export default function PartnerFormModal({ open, kind, partner, onClose, onSaved }) {
  const isCustomer = kind === 'customers';
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(partner ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, partner[k] || ''])) : EMPTY);
  }, [open, partner]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Champ obligatoire';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Adresse e-mail invalide';
    if (form.phone && !/^[+\d][\d\s().-]{5,}$/.test(form.phone.trim())) errs.phone = 'Numéro de téléphone invalide';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const { data } = partner ? await api.put(`/${kind}/${partner.id}`, form) : await api.post(`/${kind}`, form);
      toast.success(partner ? 'Fiche mise à jour' : `${isCustomer ? 'Client' : 'Fournisseur'} ajouté`);
      onSaved?.(data);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "L'enregistrement a échoué"));
    } finally {
      setSaving(false);
    }
  };

  const noun = isCustomer ? 'client' : 'fournisseur';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={partner ? `Modifier le ${noun}` : `Nouveau ${noun}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} loading={saving}>
            {partner ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nom complet ou raison sociale" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={set('name')} maxLength={160} error={errors.name} autoFocus />
        </Field>
        <Field label="Téléphone" error={errors.phone}>
          <Input value={form.phone} onChange={set('phone')} maxLength={30} error={errors.phone} placeholder="+216 00 000 000" />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} maxLength={160} error={errors.email} />
        </Field>
        <Field label="Adresse" error={errors.address} className="sm:col-span-2">
          <Input value={form.address} onChange={set('address')} maxLength={255} />
        </Field>
        <Field label="Matricule fiscal" error={errors.tax_id} hint="Ex. 1234567A/A/M/000" className="sm:col-span-2">
          <Input value={form.tax_id} onChange={set('tax_id')} maxLength={40} />
        </Field>
        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
          <Textarea value={form.notes} onChange={set('notes')} maxLength={2000} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
