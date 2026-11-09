// Libellés français partagés par les exports PDF / Excel.

const UNITS = {
  piece: 'Pièce',
  sheet: 'Panneau',
  meter: 'Mètre',
  roll: 'Rouleau',
  kilogram: 'Kilogramme',
  liter: 'Litre',
  pack: 'Paquet',
};

const UNITS_SHORT = { piece: 'pce', sheet: 'pan.', meter: 'm', roll: 'rl.', kilogram: 'kg', liter: 'L', pack: 'pqt' };

const MOVEMENT_TYPES = { IN: 'Entrée', OUT: 'Sortie', ADJUSTMENT: 'Ajustement' };

const INVOICE_STATUS = { draft: 'Brouillon', confirmed: 'Confirmée', cancelled: 'Annulée' };

const PAYMENT_STATUS = { unpaid: 'Impayée', partial: 'Partiellement payée', paid: 'Payée', cancelled: 'Annulée' };

const PAYMENT_METHODS = { cash: 'Espèces', bank_transfer: 'Virement bancaire', cheque: 'Chèque', other: 'Autre' };

const TRANSACTION_TYPES = {
  sale: 'Vente',
  sale_cancel: 'Annulation de vente',
  payment: 'Paiement client',
  purchase: 'Achat fournisseur',
  stock_in: 'Entrée de stock',
  stock_out: 'Sortie de stock',
  adjustment: 'Ajustement de stock',
};

/** 1234.5 → "1 234,500" (séparateurs compatibles avec les polices PDF standard). */
function fmtNumber(n, decimals = 3) {
  const [int, dec] = Math.abs(Number(n) || 0).toFixed(decimals).split('.');
  const s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
  return (Number(n) < 0 ? '-' : '') + s;
}

const fmtMoney = (n) => `${fmtNumber(n, 3)} DT`;

/** Quantité sans zéros inutiles : 12 → "12", 2.5 → "2,5". */
function fmtQty(n) {
  return fmtNumber(n, 3).replace(/,?0+$/, '');
}

/** "2026-11-09" ou "2026-11-09 14:05:00" → "09/11/2026" (+ heure si demandée). */
function fmtDate(s, withTime = false) {
  if (!s) return '';
  const [d, t] = String(s).split(' ');
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}` + (withTime && t ? ` ${t.slice(0, 5)}` : '');
}

// ---- Montant en toutes lettres -------------------------------------------------
const W = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function below100(n) {
  if (n < 17) return W[n];
  if (n < 20) return `dix-${W[n - 10]}`;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    if (t === 7 && u === 1) return 'soixante et onze';
    return `${TENS[t]}-${below100(10 + u)}`;
  }
  if (u === 0) return t === 8 ? 'quatre-vingts' : TENS[t];
  if (u === 1 && t !== 8) return `${TENS[t]} et un`;
  return `${TENS[t]}-${W[u]}`;
}

function below1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return below100(r);
  const hs = h === 1 ? 'cent' : `${W[h]} cent${r === 0 ? 's' : ''}`;
  return r === 0 ? hs : `${hs} ${below100(r)}`;
}

function integerToWords(n) {
  if (n === 0) return 'zéro';
  const parts = [];
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(`${below1000(millions)} million${millions > 1 ? 's' : ''}`);
  if (thousands) {
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands).replace(/(cent|vingt)s$/, '$1')} mille`);
  }
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/** 1234.5 → "Mille deux cent trente-quatre dinars et cinq cents millimes". */
function amountInWords(amount) {
  const millimes = Math.round(Math.abs(Number(amount) || 0) * 1000);
  const d = Math.floor(millimes / 1000);
  const m = millimes % 1000;
  let s = `${integerToWords(d)} dinar${d > 1 ? 's' : ''}`;
  if (m) s += ` et ${integerToWords(m)} millime${m > 1 ? 's' : ''}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = {
  UNITS,
  UNITS_SHORT,
  MOVEMENT_TYPES,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  fmtNumber,
  fmtMoney,
  fmtQty,
  fmtDate,
  amountInWords,
};
