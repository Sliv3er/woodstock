const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

const server = app.listen(env.port, async () => {
  console.log(`API WoodStock démarrée sur http://localhost:${env.port}`);
  try {
    await pool.query('SELECT 1');
    console.log(`Connecté à MySQL (${env.db.host}:${env.db.port}/${env.db.database})`);
  } catch (err) {
    console.error(`Connexion MySQL impossible : ${err.message}`);
    console.error('Vérifiez que MySQL est démarré, le fichier .env, puis lancez « npm run db:init ».');
  }
});

const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
