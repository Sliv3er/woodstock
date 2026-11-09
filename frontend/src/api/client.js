import axios from 'axios';

const TOKEN_KEY = 'woodstock_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

// Ajoute le jeton JWT à chaque requête
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Session expirée → retour à l'écran de connexion
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLogin && getToken()) {
      setToken(null);
      window.location.assign('/connexion?expire=1');
    }
    return Promise.reject(error);
  }
);

/** Message d'erreur lisible à partir d'une erreur axios. */
export async function errorMessage(error, fallback = 'Une erreur est survenue') {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).message || fallback;
    } catch {
      return fallback;
    }
  }
  if (data?.message) return data.message;
  if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED') return 'Serveur injoignable. Vérifiez que l’API est démarrée.';
  return fallback;
}

/** Version synchrone (réponses JSON uniquement). */
export function errorText(error, fallback = 'Une erreur est survenue') {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED') return 'Serveur injoignable. Vérifiez que l’API est démarrée.';
  return fallback;
}

/** Erreurs de validation par champ : { name: 'Champ obligatoire', … } */
export function fieldErrors(error) {
  const out = {};
  for (const d of error?.response?.data?.details || []) {
    if (d.field && !out[d.field]) out[d.field] = d.message;
  }
  return out;
}

async function fetchFile(url, params) {
  const response = await api.get(url, { params, responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  return { blob: response.data, filename: match ? match[1] : 'document' };
}

/** Télécharge un fichier protégé (PDF, Excel) en passant le jeton d'authentification. */
export async function downloadFile(url, params) {
  const { blob, filename } = await fetchFile(url, params);
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

export default api;
