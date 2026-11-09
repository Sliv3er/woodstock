import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react';

const cx = (...classes) => classes.filter(Boolean).join(' ');

// ---- Boutons -------------------------------------------------------------------
// Noms de classes écrits en toutes lettres : Tailwind ne conserve que les classes qu'il trouve dans le code.
const BUTTON_VARIANTS = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', ghost: 'btn-ghost' };

export function Button({ variant = 'primary', size, icon: Icon, loading, children, className, type = 'button', ...props }) {
  return (
    <button type={type} className={cx('btn', BUTTON_VARIANTS[variant], size === 'sm' && 'btn-sm', className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...props }) {
  return (
    <button type="button" className={cx('icon-btn', className)} title={label} aria-label={label} {...props}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ---- Formulaires ---------------------------------------------------------------
export function Field({ label, error, required, hint, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export const Input = ({ error, className, ...props }) => <input className={cx('input', error && 'input-error', className)} {...props} />;

export const Select = ({ error, className, children, ...props }) => (
  <select className={cx('input', error && 'input-error', className)} {...props}>
    {children}
  </select>
);

export const Textarea = ({ error, className, ...props }) => <textarea rows={3} className={cx('input', error && 'input-error', className)} {...props} />;

export function SearchInput({ value, onChange, placeholder = 'Rechercher…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-9" />
    </div>
  );
}

/**
 * Liste déroulante avec recherche (produits, clients…).
 * options : [{ value, label, sublabel?, disabled? }]
 */
export function Combobox({ options, value, onChange, placeholder = 'Sélectionner…', error, disabled, emptyText = 'Aucun résultat' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.sublabel || ''}`.toLowerCase().includes(q));
  }, [options, text]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setText('');
        }}
        className={cx('input flex items-center justify-between gap-2 text-left', error && 'input-error')}
      >
        <span className={cx('truncate', !selected && 'text-ink-400')}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg">
          <div className="border-b border-ink-100 p-2">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Rechercher…" className="input py-1.5" />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-400">{emptyText}</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    onChange(o.value, o);
                    setOpen(false);
                  }}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40',
                    String(o.value) === String(value) && 'bg-brand-50'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ink-800">{o.label}</span>
                    {o.sublabel && <span className="block truncate text-xs text-ink-400">{o.sublabel}</span>}
                  </span>
                  {String(o.value) === String(value) && <Check className="h-4 w-4 shrink-0 text-brand-700" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Fenêtres modales ----------------------------------------------------------
export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx('w-full rounded-xl bg-white shadow-xl', width)}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton icon={X} label="Fermer" onClick={onClose} />
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-ink-100 bg-ink-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Demande de confirmation avant une action destructrice. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmer', danger = true, loading, onConfirm, onClose, children }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
        )}
        <div className="min-w-0 flex-1 text-sm text-ink-600">
          <p>{message}</p>
          {children}
        </div>
      </div>
    </Modal>
  );
}

// ---- Affichage -----------------------------------------------------------------
const BADGE_COLORS = {
  green: 'bg-brand-50 text-brand-800 ring-brand-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  gray: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  violet: 'bg-violet-50 text-violet-800 ring-violet-600/20',
  teal: 'bg-teal-50 text-teal-800 ring-teal-600/20',
};

export const Badge = ({ color = 'gray', children, className }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE_COLORS[color], className)}>{children}</span>
);

export const Spinner = ({ className }) => <Loader2 className={cx('h-5 w-5 animate-spin text-brand-700', className)} />;

export const Loading = ({ label = 'Chargement…' }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-ink-500">
    <Spinner /> {label}
  </div>
);

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100">
        <Icon className="h-6 w-6 text-ink-400" />
      </div>
      <p className="font-medium text-ink-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <p className="font-medium text-ink-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Enveloppe standard d'un contenu chargé : chargement → erreur → vide → contenu. */
export function DataState({ loading, error, empty, onRetry, emptyProps, children }) {
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'green' }) {
  const tones = {
    green: 'bg-brand-50 text-brand-700',
    blue: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-700',
    gray: 'bg-ink-100 text-ink-600',
  };
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-500">{label}</p>
        <p className="tabular truncate text-lg font-semibold text-ink-900">{value}</p>
        {hint && <p className="truncate text-xs text-ink-400">{hint}</p>}
      </div>
    </div>
  );
}

// ---- Tableaux ------------------------------------------------------------------
/** En-tête de colonne triable. */
export function SortTh({ label, field, sort, order, onSort, className }) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={className}>
      <button type="button" onClick={() => onSort(field)} className={cx('inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-800', active && 'text-brand-800')}>
        {label} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

export function Pagination({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 text-sm text-ink-500">
      <span>
        {from}–{to} sur {total}
      </span>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Page précédente" disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <span className="px-2">
          Page {page} / {pages}
        </span>
        <IconButton icon={ChevronRight} label="Page suivante" disabled={page >= pages} onClick={() => onChange(page + 1)} />
      </div>
    </div>
  );
}

/** Onglets simples. tabs : [{ key, label, count? }] */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ink-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition',
            active === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-500 hover:text-ink-800'
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export { cx };
