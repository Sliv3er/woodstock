import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, Boxes, PackageX, Plus, X } from 'lucide-react';
import { useDebounce, useFetch } from '../utils/hooks';
import { MOVEMENT_SOURCES, MOVEMENT_TYPES, fmtDateTime, fmtMoney, fmtQty } from '../utils/format';
import { Badge, Button, DataState, Input, PageHeader, Pagination, SearchInput, Select, StatCard } from '../components/ui';
import MovementModal from '../components/MovementModal';

const LIMIT = 20;

export default function StockMovements() {
  const [params, setParams] = useSearchParams();
  const productId = params.get('product_id') || '';

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(params.get('nouveau') || null); // type du mouvement à saisir

  const debouncedSearch = useDebounce(search);
  useEffect(() => setPage(1), [debouncedSearch, type, from, to, productId]);

  const { data: summary, reload: reloadSummary } = useFetch('/stock/summary');
  const { data: product } = useFetch(productId ? `/products/${productId}` : null);
  const { data, loading, error, reload } = useFetch('/stock/movements', { search: debouncedSearch, type, from, to, product_id: productId, page, limit: LIMIT });

  const refresh = () => {
    reload();
    reloadSummary();
  };
  const filtered = Boolean(debouncedSearch || type || from || to || productId);
  const closeModal = () => {
    setModal(null);
    if (params.get('nouveau')) {
      params.delete('nouveau');
      setParams(params, { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        title="Mouvements de stock"
        subtitle="Entrées, sorties et ajustements — historique complet"
        actions={
          <Button icon={Plus} onClick={() => setModal('IN')}>
            Nouveau mouvement
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Boxes} tone="blue" label="Valeur du stock (coût)" value={summary ? fmtMoney(summary.stock_value) : '…'} />
        <StatCard icon={ArrowLeftRight} label="Valeur à la vente" value={summary ? fmtMoney(summary.sale_value) : '…'} />
        <StatCard icon={AlertTriangle} tone="amber" label="Produits en stock faible" value={summary ? summary.low_stock : '…'} />
        <StatCard icon={PackageX} tone="red" label="Produits en rupture" value={summary ? summary.out_of_stock : '…'} />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Produit, référence, document…" className="w-full sm:w-64" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full sm:w-44" aria-label="Type de mouvement">
            <option value="">Tous les types</option>
            <option value="IN">Entrées</option>
            <option value="OUT">Sorties</option>
            <option value="ADJUSTMENT">Ajustements</option>
          </Select>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
            <span className="text-ink-400">au</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Au" className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
          </div>
          {productId && product && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800">
              Produit : {product.name}
              <button type="button" onClick={() => setParams({}, { replace: true })} aria-label="Retirer le filtre produit">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.data.length === 0}
          emptyProps={{
            icon: ArrowLeftRight,
            title: filtered ? 'Aucun mouvement ne correspond à ces critères' : 'Aucun mouvement de stock',
            text: filtered ? 'Modifiez la période ou les filtres.' : 'Enregistrez une première entrée de stock.',
          }}
        >
          {data && (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Date et heure</th>
                      <th>Type</th>
                      <th>Produit</th>
                      <th className="text-right">Quantité</th>
                      <th className="text-right">Stock avant</th>
                      <th className="text-right">Stock après</th>
                      <th>Document</th>
                      <th>Notes</th>
                      <th>Utilisateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((m) => (
                      <tr key={m.id}>
                        <td className="text-xs text-ink-400">#{m.id}</td>
                        <td className="whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                        <td>
                          <Badge color={MOVEMENT_TYPES[m.type].color}>{MOVEMENT_TYPES[m.type].label}</Badge>
                          <span className="mt-0.5 block text-xs text-ink-400">{MOVEMENT_SOURCES[m.source]}</span>
                        </td>
                        <td className="min-w-[220px]">
                          <Link to={`/produits/${m.product_id}`} className="font-medium text-ink-900 hover:underline">
                            {m.product_name}
                          </Link>
                          <span className="block font-mono text-xs text-ink-400">{m.sku}</span>
                        </td>
                        <td className="num font-semibold text-ink-900">
                          {m.type === 'IN' ? '+' : m.type === 'OUT' ? '−' : m.new_quantity >= m.previous_quantity ? '+' : '−'}
                          {fmtQty(m.quantity, m.unit)}
                        </td>
                        <td className="num text-ink-500">{fmtQty(m.previous_quantity)}</td>
                        <td className="num font-medium text-ink-900">{fmtQty(m.new_quantity)}</td>
                        <td className="whitespace-nowrap">
                          {m.invoice_id ? (
                            <Link to={`/factures/${m.invoice_id}`} className="text-brand-700 hover:underline">
                              {m.reference}
                            </Link>
                          ) : (
                            m.reference || '—'
                          )}
                          {m.supplier_name && <span className="block text-xs text-ink-400">{m.supplier_name}</span>}
                        </td>
                        <td className="max-w-[220px] truncate text-ink-500" title={m.notes || ''}>
                          {m.notes || '—'}
                        </td>
                        <td className="whitespace-nowrap text-ink-500">{m.user_name}</td>
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

      <MovementModal open={Boolean(modal)} defaultType={modal || 'IN'} product={productId && product ? product : undefined} onClose={closeModal} onSaved={refresh} />
    </>
  );
}
