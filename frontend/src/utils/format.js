// Formats français (dates JJ/MM/AAAA) et dinar tunisien (3 décimales : millimes).

const money = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const compact = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const UNITS = {
  piece: 'Pièce',
  sheet: 'Panneau',
  meter: 'Mètre',
  roll: 'Rouleau',
  kilogram: 'Kilogramme',
  liter: 'Litre',
  pack: 'Paquet',
};

export const UNITS_SHORT = { piece: 'pce', sheet: 'pan.', meter: 'm', roll: 'rl.', kilogram: 'kg', liter: 'L', pack: 'pqt' };

export const fmtNumber = (n) => money.format(Number(n) || 0);
export const fmtMoney = (n) => `${money.format(Number(n) || 0)} DT`;
export const fmtMoneyShort = (n) => `${compact.format(Number(n) || 0)} DT`;
export const fmtQty = (n, unit) => `${quantity.format(Number(n) || 0)}${unit ? ` ${UNITS_SHORT[unit] || unit}` : ''}`;
export const fmtPercent = (n) => `${quantity.format(Number(n) || 0)} %`;

/** "2026-11-09" ou "2026-11-09 14:05:00" → "09/11/2026" */
export function fmtDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).split(/[ T]/)[0].split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-11-09 14:05:00" → "09/11/2026 14:05" */
export function fmtDateTime(value) {
  if (!value) return '—';
  const time = String(value).split(/[ T]/)[1];
  return time ? `${fmtDate(value)} ${time.slice(0, 5)}` : fmtDate(value);
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = () => iso(new Date());
export const firstOfMonthISO = () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
export const firstOfYearISO = () => `${new Date().getFullYear()}-01-01`;
export function addDaysISO(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** "2026-11" → "nov. 26" */
export const monthShort = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
/** "2026-11" → "Novembre 2026" */
export const monthLong = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// ---- Libellés et couleurs des états ----------------------------------------------
export const MOVEMENT_TYPES = {
  IN: { label: 'Entrée', color: 'green' },
  OUT: { label: 'Sortie', color: 'red' },
  ADJUSTMENT: { label: 'Ajustement', color: 'amber' },
};

export const MOVEMENT_SOURCES = {
  manual: 'Saisie manuelle',
  initial: 'Stock initial',
  invoice: 'Vente (facture)',
  invoice_cancel: 'Annulation de facture',
};

export const INVOICE_STATUS = {
  draft: { label: 'Brouillon', color: 'gray' },
  confirmed: { label: 'Confirmée', color: 'blue' },
  cancelled: { label: 'Annulée', color: 'red' },
};

export const PAYMENT_STATUS = {
  unpaid: { label: 'Impayée', color: 'red' },
  partial: { label: 'Partiellement payée', color: 'amber' },
  paid: { label: 'Payée', color: 'green' },
  cancelled: { label: 'Annulée', color: 'gray' },
};

export const PAYMENT_METHODS = {
  cash: 'Espèces',
  bank_transfer: 'Virement bancaire',
  cheque: 'Chèque',
  other: 'Autre',
};

export const TRANSACTION_TYPES = {
  sale: { label: 'Vente', color: 'blue' },
  sale_cancel: { label: 'Annulation de vente', color: 'red' },
  payment: { label: 'Paiement client', color: 'green' },
  purchase: { label: 'Achat fournisseur', color: 'violet' },
  stock_in: { label: 'Entrée de stock', color: 'teal' },
  stock_out: { label: 'Sortie de stock', color: 'amber' },
  adjustment: { label: 'Ajustement', color: 'gray' },
};

export const ROLES = { admin: 'Administrateur', employee: 'Employé' };

/** État du stock d'un produit. */
export function stockState(p) {
  if (Number(p.quantity) === 0) return { label: 'Rupture', color: 'red' };
  if (Number(p.quantity) <= Number(p.min_stock)) return { label: 'Stock faible', color: 'amber' };
  return { label: 'Disponible', color: 'green' };
}

export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** UUID v4 (repli si crypto.randomUUID n'est pas disponible hors contexte sécurisé). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
