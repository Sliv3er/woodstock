/**
 * Initialise la base de données.
 *
 *   npm run db:init             → schéma + données de démonstration (database/seed.sql)
 *   npm run db:init -- --empty  → schéma seul + un compte administrateur (admin / admin123)
 *
 * ATTENTION : toutes les tables existantes de la base sont supprimées et recréées.
 */
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { runSqlFile } = require('./lib');

async function main() {
  const empty = process.argv.includes('--empty');

  console.log(`Création du schéma dans la base « ${env.db.database} »…`);
  await runSqlFile('schema.sql');

  if (empty) {
    const { pool } = require('../src/config/db');
    await pool.query("INSERT INTO users (username, full_name, password_hash, role) VALUES ('admin', 'Administrateur', ?, 'admin')", [
      await bcrypt.hash('admin123', 10),
    ]);
    await pool.end();
    console.log('Base vide créée. Compte : admin / admin123 (à changer dès la première connexion).');
  } else {
    console.log('Insertion des données de démonstration…');
    await runSqlFile('seed.sql');
    console.log('Base prête. Comptes de démonstration : admin / admin123 et employe / employe123.');
  }
}

main().catch((err) => {
  console.error(`Échec de l'initialisation : ${err.message}`);
  if (err.code === 'ECONNREFUSED') console.error('MySQL ne répond pas : vérifiez qu’il est démarré et les paramètres DB_* du fichier .env.');
  process.exit(1);
});
