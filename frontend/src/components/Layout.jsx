import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, BookOpen, FileText, LayoutDashboard, LogOut, Menu, Package, Settings, Truck, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../utils/hooks';
import { ROLES } from '../utils/format';
import { cx } from './ui';

const NAV = [
  { items: [{ to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true }] },
  {
    title: 'Stock',
    items: [
      { to: '/produits', label: 'Gestion des produits', icon: Package },
      { to: '/stock', label: 'Mouvements de stock', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Ventes et achats',
    items: [
      { to: '/factures', label: 'Facturation', icon: FileText },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/fournisseurs', label: 'Fournisseurs', icon: Truck },
    ],
  },
  {
    title: 'Suivi',
    items: [
      { to: '/transactions', label: 'Transactions', icon: BookOpen },
      { to: '/rapports', label: 'Rapports', icon: BarChart3 },
    ],
  },
  { title: 'Administration', items: [{ to: '/parametres', label: 'Paramètres', icon: Settings }] },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4.5" width="18" height="4" rx="1" />
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="3" y="15.5" width="18" height="4" rx="1" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="text-[15px] font-semibold text-ink-900">WoodStock</p>
        <p className="text-[11px] text-ink-500">Ste Louati SOB</p>
      </div>
    </div>
  );
}

export { Logo };

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { data: settings } = useFetch('/settings');

  // Ferme le menu mobile à chaque changement de page
  useEffect(() => setOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/connexion');
  };

  const initials = user.full_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Barre latérale */}
      {open && <div className="no-print fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cx(
          'no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-white transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink-100 px-5">
          <Logo />
          <button type="button" className="icon-btn lg:hidden" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group, i) => (
            <div key={i} className="mb-4">
              {group.title && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{group.title}</p>}
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                      isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cx('h-[18px] w-[18px]', isActive ? 'text-brand-700' : 'text-ink-400')} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{initials}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-ink-900">{user.full_name}</p>
              <p className="truncate text-xs text-ink-500">{ROLES[user.role]}</p>
            </div>
            <button type="button" className="icon-btn" onClick={handleLogout} title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Barre supérieure (mobile) */}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-200 bg-white px-4 lg:hidden">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </button>
        <Logo />
        <span className="w-8" />
      </header>

      {settings?.demo_mode && (
        <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          Données de démonstration — les clients, fournisseurs et montants affichés sont fictifs.
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
