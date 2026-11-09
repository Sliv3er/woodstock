import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Pencil } from 'lucide-react';
import { useFetch } from '../utils/hooks';
import { MOVEMENT_SOURCES, MOVEMENT_TYPES, UNITS, fmtDateTime, fmtMoney, fmtQty, stockState } from '../utils/format';
import { Badge, Button, DataState, EmptyState, PageHeader } from '../components/ui';
import ProductFormModal from '../components/ProductFormModal';
import MovementModal from '../components/MovementModal';

const Info = ({ label, children }) => (
  <div>
    <dt className="text-xs text-ink-500">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-ink-900">{children || '—'}</dd>
  </div>
);

export default function ProductDetail() {
  const { id } = useParams();
  const { data: product, loading, error, reload } = useFetch(`/products/${id}`);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);

  const state = product ? stockState(product) : null;
  // Jauge : niveau de stock par rapport à 2 × le seuil minimum
  const gauge = product ? Math.min(100, (product.quantity / Math.max(product.min_stock * 2, 1)) * 100) : 0;

  return (
    <DataState loading={loading && !product} error={error} onRetry={reload}>
      {product && (
        <>
          <PageHeader
            back={
              <Link to="/produits" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
                <ArrowLeft className="h-3.5 w-3.5" /> Produits
              </Link>
            }
            title={product.name}
            subtitle={`Référence ${product.sku} · ${product.category_name}`}
            actions={
              product.is_active ? (
                <>
                  <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                    Modifier
                  </Button>
                  <Button icon={ArrowLeftRight} onClick={() => setMoving(true)}>
                    Mouvement de stock
                  </Button>
                </>
              ) : (
                <Badge>Produit archivé</Badge>
              )
            }
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Niveau de stock */}
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-500">Stock disponible</p>
                <Badge color={state.color}>{state.label}</Badge>
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink-900">{fmtQty(product.quantity, product.unit)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
                <div className={`h-full rounded-full ${state.color === 'green' ? 'bg-brand-600' : state.color === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${gauge}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink-500">Seuil minimum : {fmtQty(product.min_stock, product.unit)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4">
                <Info label="Valeur du stock (coût)">{fmtMoney(product.quantity * product.purchase_price)}</Info>
                <Info label="Valeur à la vente">{fmtMoney(product.quantity * product.selling_price)}</Info>
              </dl>
            </div>

            {/* Fiche produit */}
            <div className="card p-5 lg:col-span-2">
              <h2 className="card-title mb-4">Fiche produit</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Info label="Identifiant">#{product.id}</Info>
                <Info label="Référence (SKU)">{product.sku}</Info>
                <Info label="Catégorie">{product.category_name}</Info>
                <Info label="Unité de mesure">{UNITS[product.unit]}</Info>
                <Info label="Prix d'achat HT">{fmtMoney(product.purchase_price)}</Info>
                <Info label="Prix de vente HT">{fmtMoney(product.selling_price)}</Info>
                <Info label="Fournisseur">
                  {product.supplier_id ? (
                    <Link to={`/fournisseurs/${product.supplier_id}`} className="text-brand-700 hover:underline">
                      {product.supplier_name}
                    </Link>
                  ) : null}
                </Info>
                <Info label="Quantité vendue">{fmtQty(product.sales.quantity_sold, product.unit)}</Info>
                <Info label="Chiffre d'affaires HT">{fmtMoney(product.sales.revenue_ht)}</Info>
                <Info label="Dernière mise à jour">{fmtDateTime(product.updated_at)}</Info>
                <div className="col-span-2">
                  <Info label="Description">{product.description}</Info>
                </div>
              </dl>
            </div>
          </div>

          {/* Historique */}
          <div className="card mt-5">
            <div className="card-header">
              <h2 className="card-title">Historique des mouvements</h2>
              <Link to={`/stock?product_id=${product.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                Voir tout l'historique
              </Link>
            </div>
            {product.movements.length === 0 ? (
              <EmptyState icon={ArrowLeftRight} title="Aucun mouvement" text="Ce produit n'a pas encore d'entrée ni de sortie de stock." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Origine</th>
                      <th>Document</th>
                      <th className="text-right">Quantité</th>
                      <th className="text-right">Avant</th>
                      <th className="text-right">Après</th>
                      <th>Utilisateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.movements.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                        <td>
                          <Badge color={MOVEMENT_TYPES[m.type].color}>{MOVEMENT_TYPES[m.type].label}</Badge>
                        </td>
                        <td className="whitespace-nowrap text-ink-500">{MOVEMENT_SOURCES[m.source]}</td>
                        <td className="whitespace-nowrap">{m.reference || '—'}</td>
                        <td className="num font-medium text-ink-900">{fmtQty(m.quantity)}</td>
                        <td className="num text-ink-500">{fmtQty(m.previous_quantity)}</td>
                        <td className="num font-medium text-ink-900">{fmtQty(m.new_quantity)}</td>
                        <td className="whitespace-nowrap text-ink-500">{m.user_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <ProductFormModal open={editing} product={product} onClose={() => setEditing(false)} onSaved={reload} />
          <MovementModal open={moving} product={product} onClose={() => setMoving(false)} onSaved={reload} />
        </>
      )}
    </DataState>
  );
}
