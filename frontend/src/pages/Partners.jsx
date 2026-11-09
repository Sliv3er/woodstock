import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, Truck, Users } from 'lucide-react';
import api, { errorText } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDebounce, useFetch } from '../utils/hooks';
import { fmtMoney } from '../utils/format';
import { Badge, Button, ConfirmDialog, DataState, IconButton, PageHeader, Pagination, SearchInput } from '../components/ui';
import PartnerFormModal from '../components/PartnerFormModal';

const LIMIT = 15;

export const PARTNER_KINDS = {
  customers: { path: '/clients', title: 'Clients', subtitle: 'Fichier clients et historique des achats', singular: 'client', add: 'Nouveau client', icon: Users },
  suppliers: { path: '/fournisseurs', title: 'Fournisseurs', subtitle: 'Fichier fournisseurs et entrées de stock associées', singular: 'fournisseur', add: 'Nouveau fournisseur', icon: Truck },
};

/** Liste des clients ou des fournisseurs (même écran, `kind` = 'customers' | 'suppliers'). */
export default function Partners({ kind }) {
  const cfg = PARTNER_KINDS[kind];
  const isCustomer = kind === 'customers';
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);
  useEffect(() => setPage(1), [debouncedSearch]);
  useEffect(() => {
    setSearch('');
    setPage(1);
  }, [kind]);

  const { data, loading, error, reload } = useFetch(`/${kind}`, { search: debouncedSearch, page, limit: LIMIT });

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/${kind}/${deleting.id}`);
      toast.success(`${isCustomer ? 'Client' : 'Fournisseur'} supprimé`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorText(err, 'Suppression impossible'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            {cfg.add}
          </Button>
        }
      />

      <div className="card">
        <div className="border-b border-ink-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Nom, téléphone, e-mail, matricule fiscal…" className="w-full sm:w-80" />
        </div>

        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.data.length === 0}
          emptyProps={{
            icon: cfg.icon,
            title: debouncedSearch ? `Aucun ${cfg.singular} ne correspond à « ${debouncedSearch} »` : `Aucun ${cfg.singular}`,
            text: debouncedSearch ? 'Vérifiez l’orthographe ou essayez un autre terme.' : `Ajoutez votre premier ${cfg.singular}.`,
            action: !debouncedSearch && (
              <Button icon={Plus} onClick={() => setEditing({})}>
                {cfg.add}
              </Button>
            ),
          }}
        >
          {data && (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Nom / raison sociale</th>
                      <th>Téléphone</th>
                      <th>E-mail</th>
                      <th>Matricule fiscal</th>
                      {isCustomer ? (
                        <>
                          <th className="text-right">Factures</th>
                          <th className="text-right">Total facturé</th>
                          <th className="text-right">Solde dû</th>
                        </>
                      ) : (
                        <>
                          <th className="text-right">Produits</th>
                          <th className="text-right">Entrées</th>
                          <th className="text-right">Total des achats</th>
                        </>
                      )}
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((p) => (
                      <tr key={p.id} className="row-link" onClick={() => navigate(`${cfg.path}/${p.id}`)}>
                        <td className="text-xs text-ink-400">#{p.id}</td>
                        <td>
                          <p className="font-medium text-ink-900">{p.name}</p>
                          {p.address && <p className="max-w-[260px] truncate text-xs text-ink-400">{p.address}</p>}
                        </td>
                        <td className="whitespace-nowrap">{p.phone || '—'}</td>
                        <td className="max-w-[200px] truncate">{p.email || '—'}</td>
                        <td className="whitespace-nowrap font-mono text-xs">{p.tax_id || '—'}</td>
                        {isCustomer ? (
                          <>
                            <td className="num">{p.invoice_count}</td>
                            <td className="num">{fmtMoney(p.total_invoiced)}</td>
                            <td className="num">{p.balance > 0 ? <Badge color="amber">{fmtMoney(p.balance)}</Badge> : <span className="text-ink-400">0,000 DT</span>}</td>
                          </>
                        ) : (
                          <>
                            <td className="num">{p.product_count}</td>
                            <td className="num">{p.entry_count}</td>
                            <td className="num">{fmtMoney(p.total_purchased)}</td>
                          </>
                        )}
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-0.5">
                            <IconButton icon={Pencil} label="Modifier" onClick={() => setEditing(p)} />
                            {isAdmin && <IconButton icon={Trash2} label="Supprimer" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(p)} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} limit={LIMIT} total={data.total} onChange={setPage} />
            </>
          )}
        </DataState>
      </div>

      <PartnerFormModal open={Boolean(editing)} kind={kind} partner={editing?.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Supprimer ce ${cfg.singular} ?`}
        message={deleting ? `« ${deleting.name} » sera définitivement supprimé.` : ''}
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      >
        <p className="mt-2 text-xs text-ink-500">
          {isCustomer ? 'Un client lié à des factures ne peut pas être supprimé.' : 'Un fournisseur lié à des entrées de stock ne peut pas être supprimé.'}
        </p>
      </ConfirmDialog>
    </>
  );
}
