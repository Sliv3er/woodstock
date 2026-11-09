import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { EmptyState, Loading } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import StockMovements from './pages/StockMovements';
import Partners from './pages/Partners';
import PartnerDetail from './pages/PartnerDetail';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceDetail from './pages/InvoiceDetail';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';

/** Redirige vers la connexion tant que l'utilisateur n'est pas authentifié. */
function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Ouverture de la session…" />;
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="produits" element={<Products />} />
        <Route path="produits/:id" element={<ProductDetail />} />
        <Route path="stock" element={<StockMovements />} />
        <Route path="clients" element={<Partners key="customers" kind="customers" />} />
        <Route path="clients/:id" element={<PartnerDetail key="customers" kind="customers" />} />
        <Route path="fournisseurs" element={<Partners key="suppliers" kind="suppliers" />} />
        <Route path="fournisseurs/:id" element={<PartnerDetail key="suppliers" kind="suppliers" />} />
        <Route path="factures" element={<Invoices />} />
        <Route path="factures/nouvelle" element={<InvoiceForm key="new" />} />
        <Route path="factures/:id" element={<InvoiceDetail />} />
        <Route path="factures/:id/modifier" element={<InvoiceForm key="edit" />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="rapports" element={<Reports />} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route path="*" element={<EmptyState title="Page introuvable" text="Cette adresse ne correspond à aucune page de l’application." />} />
      </Route>
    </Routes>
  );
}
