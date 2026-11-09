import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, FileText, Plus } from 'lucide-react';
import { downloadFile, errorMessage } from '../api/client';
import { useDebounce, useFetch } from '../utils/hooks';
import { INVOICE_STATUS, PAYMENT_STATUS, fmtDate, fmtMoney } from '../utils/format';
import { Badge, Button, DataState, IconButton, Input, PageHeader, Pagination, SearchInput, Select, SortTh } from '../components/ui';

const LIMIT = 15;

export default function Invoices() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState({ field: 'date', order: 'desc' });
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search);
  useEffect(() => setPage(1), [debouncedSearch, status, payment, from, to]);

  const { data, loading, error, reload } = useFetch('/invoices', {
    search: debouncedSearch,
    status,
    payment_status: payment,
    from,
    to,
    sort: sort.field,
    order: sort.order,
    page,
    limit: LIMIT,
  });

  const onSort = (field) => setSort((s) => ({ field, order: s.field === field && s.order === 'desc' ? 'asc' : 'desc' }));
  const sortProps = { sort: sort.field, order: sort.order, onSort };
  const filtered = Boolean(debouncedSearch || status || payment || from || to);

  const pdf = async (invoice) => {
    try {
      await downloadFile(`/invoices/${invoice.id}/pdf`);
    } catch (err) {
      toast.error(await errorMessage(err, 'Le PDF n’a pas pu être généré'));
    }
  };

  return (
    <>
      <PageHeader
        title="Facturation"
        subtitle="Factures clients, règlements et documents PDF"
        actions={
          <Button icon={Plus} onClick={() => navigate('/factures/nouvelle')}>
            Nouvelle facture
          </Button>
        }
      />

      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="N° de facture ou client…" className="w-full sm:w-64" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44" aria-label="État de la facture">
            <option value="">Tous les états</option>
            <option value="draft">Brouillons</option>
            <option value="confirmed">Confirmées</option>
            <option value="cancelled">Annulées</option>
          </Select>
          <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="w-full sm:w-52" aria-label="État du règlement">
            <option value="">Tous les règlements</option>
            <option value="paid">Payées</option>
            <option value="partial">Partiellement payées</option>
            <option value="unpaid">Impayées</option>
            <option value="due">À encaisser (impayées + partielles)</option>
          </Select>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
            <span className="text-ink-400">au</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Au" className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
          </div>
        </div>

        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.data.length === 0}
          emptyProps={{
            icon: FileText,
            title: filtered ? 'Aucune facture ne correspond à ces critères' : 'Aucune facture',
            text: filtered ? 'Modifiez la recherche, la période ou les filtres.' : 'Créez votre première facture client.',
            action: !filtered && (
              <Button icon={Plus} onClick={() => navigate('/factures/nouvelle')}>
                Nouvelle facture
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
                      <SortTh label="N° facture" field="number" {...sortProps} />
                      <SortTh label="Date" field="date" {...sortProps} />
                      <SortTh label="Client" field="customer" {...sortProps} />
                      <th>État</th>
                      <th>Règlement</th>
                      <SortTh label="Total TTC" field="total" className="text-right" {...sortProps} />
                      <th className="text-right">Reste dû</th>
                      <th className="text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((inv) => (
                      <tr key={inv.id} className="row-link" onClick={() => navigate(`/factures/${inv.id}`)}>
                        <td className="whitespace-nowrap font-medium text-ink-900">{inv.invoice_number}</td>
                        <td className="whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                        <td className="max-w-[240px] truncate">{inv.customer_name}</td>
                        <td>
                          <Badge color={INVOICE_STATUS[inv.status].color}>{INVOICE_STATUS[inv.status].label}</Badge>
                        </td>
                        <td>{inv.status === 'confirmed' ? <Badge color={PAYMENT_STATUS[inv.payment_status].color}>{PAYMENT_STATUS[inv.payment_status].label}</Badge> : <span className="text-ink-300">—</span>}</td>
                        <td className="num font-semibold text-ink-900">{fmtMoney(inv.total_ttc)}</td>
                        <td className="num">{inv.status === 'confirmed' && inv.balance > 0 ? fmtMoney(inv.balance) : <span className="text-ink-300">—</span>}</td>
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <IconButton icon={Download} label="Télécharger le PDF" onClick={() => pdf(inv)} />
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
    </>
  );
}
