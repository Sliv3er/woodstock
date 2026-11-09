import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Pencil, Plus, Save, ShieldCheck, Star, Trash2 } from 'lucide-react';
import api, { errorText, fieldErrors } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../utils/hooks';
import { ROLES, fmtDateTime, fmtPercent } from '../utils/format';
import { Badge, Button, ConfirmDialog, DataState, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui';

// =================================================================================
//  Société
// =================================================================================
function CompanyTab() {
  const { data, loading, error, reload } = useFetch('/settings', { all: 1 });
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm({ ...data.company, stamp_duty: String(data.stamp_duty) });
  }, [data]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.company_name.trim()) errs.company_name = 'Champ obligatoire';
    if (form.stamp_duty === '' || Number(form.stamp_duty) < 0) errs.stamp_duty = 'Valeur numérique ≥ 0 requise';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api.put('/settings', form);
      toast.success('Paramètres de la société enregistrés');
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "L'enregistrement a échoué"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DataState loading={loading && !form} error={error} onRetry={reload}>
      {form && (
        <form onSubmit={submit} className="card max-w-3xl" noValidate>
          <div className="card-header">
            <div>
              <h2 className="card-title">Informations de la société</h2>
              <p className="text-xs text-ink-500">Ces informations figurent sur l'en-tête des factures et des rapports.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Raison sociale" required error={errors.company_name}>
              <Input value={form.company_name} onChange={set('company_name')} maxLength={160} error={errors.company_name} />
            </Field>
            <Field label="Activité" error={errors.company_activity}>
              <Input value={form.company_activity} onChange={set('company_activity')} maxLength={200} />
            </Field>
            <Field label="Adresse" error={errors.company_address} className="sm:col-span-2">
              <Input value={form.company_address} onChange={set('company_address')} maxLength={255} />
            </Field>
            <Field label="Téléphone" error={errors.company_phone}>
              <Input value={form.company_phone} onChange={set('company_phone')} maxLength={40} />
            </Field>
            <Field label="E-mail" error={errors.company_email}>
              <Input value={form.company_email} onChange={set('company_email')} maxLength={160} />
            </Field>
            <Field label="Matricule fiscal" error={errors.company_tax_id}>
              <Input value={form.company_tax_id} onChange={set('company_tax_id')} maxLength={40} />
            </Field>
            <Field label="RIB bancaire" error={errors.company_rib}>
              <Input value={form.company_rib} onChange={set('company_rib')} maxLength={60} />
            </Field>
            <Field label="Timbre fiscal par facture (DT)" required error={errors.stamp_duty} hint="Appliqué par défaut aux nouvelles factures">
              <Input type="number" min="0" step="0.001" value={form.stamp_duty} onChange={set('stamp_duty')} error={errors.stamp_duty} />
            </Field>
            <Field label="Mention en pied de facture" error={errors.invoice_footer} className="sm:col-span-2">
              <Textarea value={form.invoice_footer} onChange={set('invoice_footer')} maxLength={300} rows={2} />
            </Field>
          </div>
          <div className="flex justify-end rounded-b-xl border-t border-ink-100 bg-ink-50 px-5 py-3">
            <Button type="submit" icon={Save} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </form>
      )}
    </DataState>
  );
}

// =================================================================================
//  Taux de TVA
// =================================================================================
function VatTab() {
  const { data, loading, error, reload } = useFetch('/settings', { all: 1 });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ label: '', rate: '', is_default: false, is_active: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const openForm = (vat) => {
    setErrors({});
    setForm(vat ? { label: vat.label, rate: String(vat.rate), is_default: Boolean(vat.is_default), is_active: Boolean(vat.is_active) } : { label: '', rate: '', is_default: false, is_active: true });
    setEditing(vat || {});
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.label.trim()) errs.label = 'Champ obligatoire';
    if (form.rate === '' || Number(form.rate) < 0 || Number(form.rate) > 100) errs.rate = 'Taux entre 0 et 100';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const payload = { ...form, rate: Number(form.rate) };
      if (editing.id) await api.put(`/settings/vat-rates/${editing.id}`, payload);
      else await api.post('/settings/vat-rates', payload);
      toast.success('Taux de TVA enregistré');
      setEditing(null);
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "L'enregistrement a échoué"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/settings/vat-rates/${deleting.id}`);
      toast.success('Taux supprimé');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorText(err, 'Suppression impossible'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card max-w-3xl">
      <div className="card-header">
        <div>
          <h2 className="card-title">Taux de TVA</h2>
          <p className="text-xs text-ink-500">Taux proposés lors de la création d'une facture. Chaque facture conserve le taux appliqué à sa date.</p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => openForm(null)}>
          Ajouter un taux
        </Button>
      </div>
      <DataState loading={loading && !data} error={error} onRetry={reload} empty={data?.vat_rates.length === 0} emptyProps={{ title: 'Aucun taux de TVA' }}>
        {data && (
          <table className="table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th className="text-right">Taux</th>
                <th>État</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.vat_rates.map((v) => (
                <tr key={v.id}>
                  <td className="font-medium text-ink-900">
                    {v.label}
                    {Boolean(v.is_default) && (
                      <Badge color="green" className="ml-2">
                        <Star className="mr-1 h-3 w-3" /> Par défaut
                      </Badge>
                    )}
                  </td>
                  <td className="num">{fmtPercent(v.rate)}</td>
                  <td>{v.is_active ? <Badge color="green">Actif</Badge> : <Badge>Inactif</Badge>}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} label="Modifier" onClick={() => openForm(v)} />
                      <IconButton icon={Trash2} label="Supprimer" disabled={Boolean(v.is_default)} className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(v)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataState>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? 'Modifier le taux de TVA' : 'Nouveau taux de TVA'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} loading={busy}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Libellé" required error={errors.label}>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} placeholder="TVA 19 %" error={errors.label} />
          </Field>
          <Field label="Taux (%)" required error={errors.rate}>
            <Input type="number" min="0" max="100" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} error={errors.rate} />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-600" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Taux actif (proposé sur les factures)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-600" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            Taux par défaut des nouvelles factures
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer ce taux de TVA ?"
        message={deleting ? `Le taux « ${deleting.label} » ne sera plus proposé. Les factures existantes ne sont pas modifiées.` : ''}
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// =================================================================================
//  Catégories de produits
// =================================================================================
function CategoriesTab() {
  const { data, loading, error, reload } = useFetch('/categories');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const openForm = (c) => {
    setErrors({});
    setForm({ name: c?.name || '', description: c?.description || '' });
    setEditing(c || {});
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'Champ obligatoire' });
      return;
    }
    setBusy(true);
    try {
      if (editing.id) await api.put(`/categories/${editing.id}`, form);
      else await api.post('/categories', form);
      toast.success('Catégorie enregistrée');
      setEditing(null);
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "L'enregistrement a échoué"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/categories/${deleting.id}`);
      toast.success('Catégorie supprimée');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorText(err, 'Suppression impossible'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card max-w-3xl">
      <div className="card-header">
        <div>
          <h2 className="card-title">Catégories de produits</h2>
          <p className="text-xs text-ink-500">Classement du catalogue et des statistiques de stock.</p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => openForm(null)}>
          Ajouter une catégorie
        </Button>
      </div>
      <DataState loading={loading && !data} error={error} onRetry={reload} empty={data?.length === 0} emptyProps={{ title: 'Aucune catégorie' }}>
        {data && (
          <table className="table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Description</th>
                <th className="text-right">Produits</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap font-medium text-ink-900">{c.name}</td>
                  <td className="text-ink-500">{c.description || '—'}</td>
                  <td className="num">{c.product_count}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={Pencil} label="Modifier" onClick={() => openForm(c)} />
                      <IconButton icon={Trash2} label="Supprimer" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(c)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataState>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} loading={busy}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Nom" required error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} error={errors.name} autoFocus />
          </Field>
          <Field label="Description" error={errors.description}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={255} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer cette catégorie ?"
        message={deleting ? `« ${deleting.name} » sera supprimée. Une catégorie contenant des produits ne peut pas être supprimée.` : ''}
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// =================================================================================
//  Utilisateurs
// =================================================================================
const EMPTY_USER = { username: '', full_name: '', email: '', role: 'employee', is_active: true, password: '' };

function UsersTab() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch('/users');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const openForm = (u) => {
    setErrors({});
    setForm(u ? { username: u.username, full_name: u.full_name, email: u.email || '', role: u.role, is_active: Boolean(u.is_active), password: '' } : EMPTY_USER);
    setEditing(u || {});
  };
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(form.username.trim())) errs.username = '3 à 50 caractères : lettres, chiffres, point, tiret';
    if (!form.full_name.trim()) errs.full_name = 'Champ obligatoire';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Adresse e-mail invalide';
    if (!editing.id && form.password.length < 8) errs.password = 'Au moins 8 caractères';
    if (editing.id && form.password && form.password.length < 8) errs.password = 'Au moins 8 caractères';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (editing.id) await api.put(`/users/${editing.id}`, form);
      else await api.post('/users', form);
      toast.success(editing.id ? 'Utilisateur mis à jour' : 'Utilisateur créé');
      setEditing(null);
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorText(err, "L'enregistrement a échoué"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/users/${deleting.id}`);
      toast.success(res.data.message);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorText(err, 'Suppression impossible'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Utilisateurs et rôles</h2>
          <p className="text-xs text-ink-500">
            L'administrateur gère la configuration, les utilisateurs, les annulations et les ajustements. L'employé réalise les opérations quotidiennes.
          </p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => openForm(null)}>
          Nouvel utilisateur
        </Button>
      </div>
      <DataState loading={loading && !data} error={error} onRetry={reload} empty={data?.length === 0} emptyProps={{ title: 'Aucun utilisateur' }}>
        {data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Nom d'utilisateur</th>
                  <th>E-mail</th>
                  <th>Rôle</th>
                  <th>État</th>
                  <th>Dernière connexion</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-ink-900">
                      {u.full_name} {u.id === me.id && <span className="text-xs font-normal text-ink-400">(vous)</span>}
                    </td>
                    <td className="font-mono text-xs">{u.username}</td>
                    <td>{u.email || '—'}</td>
                    <td>
                      <Badge color={u.role === 'admin' ? 'violet' : 'blue'}>{ROLES[u.role]}</Badge>
                    </td>
                    <td>{u.is_active ? <Badge color="green">Actif</Badge> : <Badge>Désactivé</Badge>}</td>
                    <td className="whitespace-nowrap text-ink-500">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Jamais'}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <IconButton icon={Pencil} label="Modifier" onClick={() => openForm(u)} />
                        <IconButton icon={Trash2} label="Supprimer" disabled={u.id === me.id} className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(u)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} loading={busy}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate autoComplete="off">
          <Field label="Nom complet" required error={errors.full_name}>
            <Input value={form.full_name} onChange={set('full_name')} maxLength={120} error={errors.full_name} />
          </Field>
          <Field label="Nom d'utilisateur" required error={errors.username}>
            <Input value={form.username} onChange={set('username')} maxLength={50} error={errors.username} autoComplete="off" />
          </Field>
          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={form.email} onChange={set('email')} maxLength={160} error={errors.email} />
          </Field>
          <Field label="Rôle" required error={errors.role}>
            <Select value={form.role} onChange={set('role')}>
              <option value="employee">Employé</option>
              <option value="admin">Administrateur</option>
            </Select>
          </Field>
          <Field label={editing?.id ? 'Nouveau mot de passe' : 'Mot de passe'} required={!editing?.id} error={errors.password} hint={editing?.id ? 'Laisser vide pour ne pas le changer' : 'Au moins 8 caractères'} className="sm:col-span-2">
            <Input type="password" value={form.password} onChange={set('password')} maxLength={100} error={errors.password} autoComplete="new-password" />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-600" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Compte actif (autorisé à se connecter)
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer cet utilisateur ?"
        message={deleting ? `Le compte de ${deleting.full_name} sera supprimé. S'il a déjà saisi des opérations, il sera seulement désactivé afin de conserver l'historique.` : ''}
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// =================================================================================
//  Mon compte
// =================================================================================
function AccountTab() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.current_password) errs.current_password = 'Champ obligatoire';
    if (form.new_password.length < 8) errs.new_password = 'Au moins 8 caractères';
    if (form.confirm !== form.new_password) errs.confirm = 'Les deux mots de passe ne correspondent pas';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api.put('/auth/password', { current_password: form.current_password, new_password: form.new_password });
      toast.success('Mot de passe modifié');
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast.error(errorText(err, 'Le mot de passe n’a pas pu être modifié'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-5 md:grid-cols-2">
      <div className="card p-5">
        <h2 className="card-title mb-4">Mon profil</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Nom</dt>
            <dd className="font-medium text-ink-900">{user.full_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Nom d'utilisateur</dt>
            <dd className="font-medium text-ink-900">{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">E-mail</dt>
            <dd className="font-medium text-ink-900">{user.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Rôle</dt>
            <dd className="mt-0.5">
              <Badge color={user.role === 'admin' ? 'violet' : 'blue'}>
                <ShieldCheck className="mr-1 h-3 w-3" /> {ROLES[user.role]}
              </Badge>
            </dd>
          </div>
        </dl>
      </div>

      <form onSubmit={submit} className="card p-5" noValidate>
        <h2 className="card-title mb-4">Changer mon mot de passe</h2>
        <div className="space-y-4">
          <Field label="Mot de passe actuel" required error={errors.current_password}>
            <Input type="password" value={form.current_password} onChange={set('current_password')} error={errors.current_password} autoComplete="current-password" />
          </Field>
          <Field label="Nouveau mot de passe" required error={errors.new_password} hint="Au moins 8 caractères">
            <Input type="password" value={form.new_password} onChange={set('new_password')} error={errors.new_password} autoComplete="new-password" />
          </Field>
          <Field label="Confirmer le nouveau mot de passe" required error={errors.confirm}>
            <Input type="password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
          </Field>
          <Button type="submit" icon={KeyRound} loading={saving}>
            Modifier le mot de passe
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const tabs = isAdmin
    ? [
        { key: 'company', label: 'Société' },
        { key: 'vat', label: 'TVA' },
        { key: 'categories', label: 'Catégories' },
        { key: 'users', label: 'Utilisateurs' },
        { key: 'account', label: 'Mon compte' },
      ]
    : [{ key: 'account', label: 'Mon compte' }];
  const [tab, setTab] = useState(tabs[0].key);

  return (
    <>
      <PageHeader title="Paramètres" subtitle={isAdmin ? "Configuration de l'application, TVA, catégories et comptes utilisateurs" : 'Votre compte utilisateur'} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {!isAdmin && (
        <div className="mb-4 max-w-3xl rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-500">
          La configuration de la société, les taux de TVA et la gestion des utilisateurs sont réservés aux administrateurs.
        </div>
      )}
      {tab === 'company' && <CompanyTab />}
      {tab === 'vat' && <VatTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'account' && <AccountTab />}
    </>
  );
}
