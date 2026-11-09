const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const DATABASE_DIR = path.join(__dirname, '..', '..', 'database');

/** Exécute un fichier .sql complet (plusieurs instructions) sur le serveur MySQL configuré. */
async function runSqlFile(filename) {
  let sql = fs.readFileSync(path.join(DATABASE_DIR, filename), 'utf8');
  // Les scripts ciblent la base « woodstock » ; on respecte DB_NAME si elle est différente.
  if (env.db.database !== 'woodstock') {
    sql = sql
      .replace(/CREATE DATABASE IF NOT EXISTS woodstock/, `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\``)
      .replace(/^USE woodstock;/m, `USE \`${env.db.database}\`;`);
  }
  const { database, ...server } = env.db;
  const conn = await mysql.createConnection({ ...server, multipleStatements: true, charset: 'utf8mb4' });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

module.exports = { DATABASE_DIR, runSqlFile };
