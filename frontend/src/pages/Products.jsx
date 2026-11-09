import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArchiveRestore, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import api, { errorText } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDebounce, useFetch } from '../utils/hooks';
import { UNITS, fmtDate, fmtNumber, fmtQty, stockState } from '../utils/format';
import { Badge, Button, ConfirmDialog, DataState, IconButton, PageHeader, Pagination, SearchInput, Select, SortTh } from '../components/ui';
import ProductFormModal from '../components/ProductFormModal';

const LIMIT = 15;

export default function Products() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState(params.get('stock') || '');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState({ field: 'name', order: 'asc' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // produit en cours d'édition, ou {} pour une création
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);
  useEffect(() => setPage(1), [debouncedSearch, category, stock, archived]);

  const { data: categories } = useFetch('/categories');
  const { data: alerts, reload: reloadAlerts } = useFetch('/stock/summary');
  const { data, loading, error, reload } = useFetch('/products', {
    search: debouncedSearch,
    category_id: category,
    stock,
    archived: archived ? 1 : undefined,
    sort: sort.field,
    order: sort.order,
    page,
    limit: LIMIT,
  });

  const refresh = () => {
    reload();
    reloadAlerts();
  };
  const onSort = (field) => setSort((s) => ({ field, order: s.field === field && s.order === 'asc' ? 'desc' : 'asc' }));
  const sortProps = { sort: sort.field, order: sort.order, onSort };

  const changeStock = (value) => {
    setStock(value);
    setParams(value ? { stock: value } : {}, { replace: true });
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/products/${deleting.id}`);
      toast.success(res.data.message);
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.error(errorText(err, 'Suppression impossible'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (product) => {
    try {
      await api.post(`/products/${product.id}/restore`);
      toast.success(`« ${product.name} » a été restauré`);
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const alertCount = alerts ? Number(alerts.low_stock) + Number(alerts.out_of_stock) : 0;
  const filtered = Boolean(debouncedSearch || category || stock || archived);

  return (
    <>
      <PageHeader
        title="Gestion des produits"
        subtitle="Catalogue, prix et niveaux de stock"
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Nouveau produit
          </Button>
        }
      />

      {alertCount > 0 && stock !== 'alert' && !archived && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              <strong>{alertCount} produit(s)</strong> ont atteint leur seuil minimum de stock
              {Number(alerts.out_of_stock) > 0 && <> dont {alerts.out_of_stock} en rupture</>}.
            </span>
          </span>
          <button type="button" className="font-medium underline" onClick={() => changeStock('alert')}>
            Afficher ces produits
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par nom, référence…" className="w-full sm:w-72" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full sm:w-48" aria-label="Catégorie">
            <option value="">Toutes les catégories</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={stock} onChange={(e) => changeStock(e.target.value)} className="w-full sm:w-60" aria-label="État du stock">
            <option value="">Tous les niveaux de stock</option>
            <option value="ok">Disponible</option>
            <option value="alert">Stock faible ou rupture</option>
            <option value="out">Rupture uniquement</option>
          </Select>
          {isAdmin && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-600" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              Produits archivés
            </label>
          )}
        </div>

        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.data.length === 0}
          emptyProps={{
            icon: Package,
            title: filtered ? 'Aucun produit ne correspond à ces critères' : 'Aucun produit',
            text: filtered ? 'Modifiez la recherche ou les filtres.' : 'Commencez par ajouter votre premier produit au catalogue.',
            action: !filtered && (
              <Button icon={Plus} onClick={() => setEditing({})}>
                Nouveau produit
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
                      <SortTh label="Référence" field="sku" {...sortProps} />
                      <SortTh label="Désignation" field="name" {...sortProps} />
                      <SortTh label="Catégorie" field="category" {...sortProps} />
                      <SortTh label="Prix d'achat" field="purchase_price" className="text-right" {...sortProps} />
                      <SortTh label="Prix de vente" field="selling_price" className="text-right" {...sortProps} />
                      <SortTh label="Stock" field="quantity" className="text-right" {...sortProps} />
                      <th>État</th>
                      <SortTh label="Mis à jour" field="updated_at" {...sortProps} />
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((p) => {
                      const state = stockState(p);
                      return (
                        <tr key={p.id} className="row-link" onClick={() => navigate(`/produits/${p.id}`)}>
                          <td className="whitespace-nowrap font-mono text-xs text-ink-600">{p.sku}</td>
                          <td className="min-w-[210px]">
                            <p className="font-medium text-ink-900">{p.name}</p>
                            <p className="text-xs text-ink-400">
                              {UNITS[p.unit]}
                              {p.supplier_name ? ` · ${p.supplier_name}` : ''}
                            </p>
                          </td>
                          <td className="whitespace-nowrap">{p.category_name}</td>
                          <td className="num">{fmtNumber(p.purchase_price)}</td>
                          <td className="num font-medium text-ink-900">{fmtNumber(p.selling_price)}</td>
                          <td className="num">
                            <span className="font-semibold text-ink-900">{fmtQty(p.quantity, p.unit)}</span>
                            <span className="block text-xs text-ink-400">seuil {fmtQty(p.min_stock)}</span>
                          </td>
                          <td>{p.is_active ? <Badge color={state.color}>{state.label}</Badge> : <Badge>Archivé</Badge>}</td>
                          <td className="whitespace-nowrap text-xs text-ink-500">{fmtDate(p.updated_at)}</td>
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-0.5">
                              {p.is_active ? (
                                <>
                                  <IconButton icon={Pencil} label="Modifier" onClick={() => setEditing(p)} />
                                  {isAdmin && <IconButton icon={Trash2} label="Supprimer" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(p)} />}
                                </>
                              ) : (
                                <IconButton icon={ArchiveRestore} label="Restaurer" onClick={() => restore(p)} />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} limit={LIMIT} total={data.total} onChange={setPage} />
            </>
          )}
        </DataState>
      </div>

      <ProductFormModal open={Boolean(editing)} product={editing?.id ? editing : null} onClose={() => setEditing(null)} onSaved={refresh} />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer ce produit ?"
        message={deleting ? `« ${deleting.name} » (${deleting.sku})` : ''}
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      >
        <p className="mt-2 text-xs text-ink-500">
          Un produit qui possède un historique (mouvements, factures) est archivé plutôt que supprimé. La suppression est refusée tant qu'il reste du stock.
        </p>
      </ConfirmDialog>
    </>
  );
}
