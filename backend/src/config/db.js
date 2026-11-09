const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL → nombres JS
  dateStrings: true, // DATE / DATETIME → chaînes (pas de décalage de fuseau)
  charset: 'utf8mb4',
});

/** Requête simple hors transaction. Les valeurs passent toujours par des paramètres `?`. */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Exécute `fn(conn)` dans une transaction SQL.
 * Toute exception provoque un ROLLBACK complet.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
