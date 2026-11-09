import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, LogIn, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorText } from '../api/client';
import { Logo } from '../components/Layout';
import { Button, Field } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(params.get('expire') ? 'Votre session a expiré. Veuillez vous reconnecter.' : '');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("Saisissez votre nom d'utilisateur et votre mot de passe.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(form.username.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errorText(err, 'Connexion impossible'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Panneau de présentation */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4.5" width="18" height="4" rx="1" />
              <rect x="3" y="10" width="18" height="4" rx="1" />
              <rect x="3" y="15.5" width="18" height="4" rx="1" />
            </svg>
          </div>
          <span className="text-lg font-semibold">WoodStock</span>
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-white">Gestion commerciale et gestion de stock pour le négoce de bois.</h1>
          <p className="mt-4 max-w-md text-ink-300">Facturation, suivi des stocks, clients, fournisseurs et journal des opérations quotidiennes — réunis dans un seul outil.</p>
          <ul className="mt-8 space-y-2 text-sm text-ink-300">
            <li>• Factures en dinar tunisien, TVA configurable, export PDF</li>
            <li>• Stock mis à jour automatiquement à chaque vente</li>
            <li>• Rapports Excel et PDF</li>
          </ul>
        </div>
        <p className="text-xs text-ink-400">Ste Louati SOB — Vente de bois et de matériaux de menuiserie</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/20 blur-3xl" />
      </div>

      {/* Formulaire */}
      <div className="flex flex-1 items-center justify-center bg-ink-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Connexion</h2>
          <p className="mt-1 text-sm text-ink-500">Accédez à votre espace de gestion.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            <Field label="Nom d'utilisateur">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" autoFocus autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
            </Field>
            <Field label="Mot de passe">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input type="password" className="input pl-9" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </Field>
            <Button type="submit" icon={LogIn} loading={loading} className="w-full py-2.5">
              Se connecter
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
