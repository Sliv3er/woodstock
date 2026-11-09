const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { query } = require('./config/db');
const { authenticate } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const partnerRouter = require('./routes/partners');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// Vérification de l'état du service (API + base de données)
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'indisponible' });
  }
});

// Route publique
app.use('/api/auth', require('./routes/auth'));

// Toutes les routes suivantes exigent un jeton JWT valide
app.use('/api', authenticate);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/customers', partnerRouter('customers'));
app.use('/api/suppliers', partnerRouter('suppliers'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/users', require('./routes/users'));

// En production, l'API peut aussi servir l'interface compilée (frontend/dist) : un seul processus à déployer.
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
