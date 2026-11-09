-- =====================================================================
--  WoodStock — Gestion commerciale et gestion de stock (Ste Louati SOB)
--  Schéma de base de données MySQL 8 / MariaDB 10.4+
--
--  Usage :  mysql -u root -p < database/schema.sql
--  (ou `npm run db:init` depuis le dossier backend)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS woodstock
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE woodstock;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS vat_rates;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS sequences;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  Utilisateurs (authentification + rôles)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('admin','employee') NOT NULL DEFAULT 'employee',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Paramètres de l'application (clé / valeur) et taux de TVA
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  setting_key   VARCHAR(60) NOT NULL,
  setting_value TEXT        NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vat_rates (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  label      VARCHAR(60)  NOT NULL,
  rate       DECIMAL(5,2) NOT NULL,
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vat_rates_rate (rate),
  CONSTRAINT chk_vat_rate CHECK (rate >= 0 AND rate <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compteurs de numérotation (factures, brouillons) par année
CREATE TABLE sequences (
  name       VARCHAR(30)       NOT NULL,
  year       SMALLINT UNSIGNED NOT NULL,
  last_value INT UNSIGNED      NOT NULL DEFAULT 0,
  PRIMARY KEY (name, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Référentiels : catégories, fournisseurs, clients
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suppliers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(160) NOT NULL,
  phone      VARCHAR(30)  NULL,
  email      VARCHAR(160) NULL,
  address    VARCHAR(255) NULL,
  tax_id     VARCHAR(40)  NULL COMMENT 'Matricule fiscal',
  notes      TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(160) NOT NULL,
  phone      VARCHAR(30)  NULL,
  email      VARCHAR(160) NULL,
  address    VARCHAR(255) NULL,
  tax_id     VARCHAR(40)  NULL COMMENT 'Matricule fiscal',
  notes      TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Produits
--  `quantity` n'est jamais modifiée directement : elle est mise à jour
--  uniquement par les mouvements de stock (voir stock_movements).
-- ---------------------------------------------------------------------
CREATE TABLE products (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sku            VARCHAR(40)   NOT NULL,
  name           VARCHAR(160)  NOT NULL,
  category_id    INT UNSIGNED  NOT NULL,
  description    TEXT          NULL,
  unit           ENUM('piece','sheet','meter','roll','kilogram','liter','pack') NOT NULL DEFAULT 'piece',
  purchase_price DECIMAL(12,3) NOT NULL DEFAULT 0,
  selling_price  DECIMAL(12,3) NOT NULL DEFAULT 0,
  quantity       DECIMAL(12,3) NOT NULL DEFAULT 0,
  min_stock      DECIMAL(12,3) NOT NULL DEFAULT 0,
  supplier_id    INT UNSIGNED  NULL,
  is_active      TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '0 = produit archivé',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_name (name),
  KEY idx_products_category (category_id),
  KEY idx_products_supplier (supplier_id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
  CONSTRAINT chk_products_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_products_prices CHECK (purchase_price >= 0 AND selling_price >= 0 AND min_stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Factures
--  status         : cycle de vie du document (brouillon → confirmée → annulée)
--  payment_status : état du règlement
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  invoice_number   VARCHAR(30)   NOT NULL,
  invoice_date     DATE          NOT NULL,
  due_date         DATE          NULL,
  customer_id      INT UNSIGNED  NOT NULL,
  status           ENUM('draft','confirmed','cancelled') NOT NULL DEFAULT 'draft',
  payment_status   ENUM('unpaid','partial','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  subtotal         DECIMAL(14,3) NOT NULL DEFAULT 0 COMMENT 'Somme des lignes HT (remises de ligne déduites)',
  discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0 COMMENT 'Remise globale en %',
  discount_amount  DECIMAL(14,3) NOT NULL DEFAULT 0,
  total_ht         DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_rate         DECIMAL(5,2)  NOT NULL DEFAULT 0 COMMENT 'Taux figé à la création',
  vat_amount       DECIMAL(14,3) NOT NULL DEFAULT 0,
  stamp_duty       DECIMAL(8,3)  NOT NULL DEFAULT 0 COMMENT 'Timbre fiscal',
  total_ttc        DECIMAL(14,3) NOT NULL DEFAULT 0,
  amount_paid      DECIMAL(14,3) NOT NULL DEFAULT 0,
  notes            TEXT          NULL,
  cancel_reason    VARCHAR(255)  NULL,
  created_by       INT UNSIGNED  NOT NULL,
  confirmed_at     DATETIME      NULL,
  cancelled_at     DATETIME      NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_number (invoice_number),
  KEY idx_invoices_customer (customer_id),
  KEY idx_invoices_date (invoice_date),
  KEY idx_invoices_status (status, payment_status),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_invoices_user FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT chk_invoices_paid CHECK (amount_paid >= 0 AND amount_paid <= total_ttc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  invoice_id       INT UNSIGNED  NOT NULL,
  product_id       INT UNSIGNED  NOT NULL,
  description      VARCHAR(200)  NOT NULL COMMENT 'Désignation figée',
  unit             VARCHAR(20)   NOT NULL,
  quantity         DECIMAL(12,3) NOT NULL,
  unit_price       DECIMAL(12,3) NOT NULL,
  discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0,
  line_total       DECIMAL(14,3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_items_product (invoice_id, product_id),
  KEY idx_invoice_items_product (product_id),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT chk_invoice_items_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Paiements clients
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  invoice_id   INT UNSIGNED  NOT NULL,
  customer_id  INT UNSIGNED  NOT NULL,
  payment_date DATE          NOT NULL,
  amount       DECIMAL(14,3) NOT NULL,
  method       ENUM('cash','bank_transfer','cheque','other') NOT NULL DEFAULT 'cash',
  reference    VARCHAR(60)   NULL COMMENT 'N° de chèque, de virement…',
  notes        VARCHAR(255)  NULL,
  created_by   INT UNSIGNED  NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_invoice (invoice_id),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_date (payment_date),
  CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_payments_user FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Mouvements de stock (historique complet, jamais modifié ni supprimé)
--  uq_movements_invoice    : une seule sortie (et une seule ré-intégration)
--                            par produit et par facture
--  uq_movements_idempotency: empêche la double saisie d'un même formulaire
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  product_id        INT UNSIGNED  NOT NULL,
  type              ENUM('IN','OUT','ADJUSTMENT') NOT NULL,
  quantity          DECIMAL(12,3) NOT NULL COMMENT 'Quantité déplacée (toujours positive)',
  previous_quantity DECIMAL(12,3) NOT NULL,
  new_quantity      DECIMAL(12,3) NOT NULL,
  unit_cost         DECIMAL(12,3) NULL COMMENT 'Coût unitaire utilisé pour valoriser le mouvement',
  source            ENUM('manual','initial','invoice','invoice_cancel') NOT NULL DEFAULT 'manual',
  reference         VARCHAR(60)   NULL COMMENT 'N° de document (BL, facture…)',
  invoice_id        INT UNSIGNED  NULL,
  supplier_id       INT UNSIGNED  NULL,
  notes             VARCHAR(500)  NULL,
  user_id           INT UNSIGNED  NOT NULL,
  idempotency_key   CHAR(36)      NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_movements_invoice (invoice_id, product_id, source),
  UNIQUE KEY uq_movements_idempotency (idempotency_key),
  KEY idx_movements_product (product_id, created_at),
  KEY idx_movements_type (type),
  KEY idx_movements_date (created_at),
  KEY idx_movements_supplier (supplier_id),
  CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_movements_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id),
  CONSTRAINT fk_movements_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_movements_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_movements_qty CHECK (quantity > 0 AND previous_quantity >= 0 AND new_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Journal des transactions quotidiennes
--  Alimenté automatiquement, dans la même transaction SQL que
--  l'opération métier (facture, paiement, mouvement de stock).
-- ---------------------------------------------------------------------
CREATE TABLE transactions (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  transaction_date  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type              ENUM('sale','sale_cancel','payment','purchase','stock_in','stock_out','adjustment') NOT NULL,
  amount            DECIMAL(14,3) NOT NULL DEFAULT 0 COMMENT 'Montant signé (ventes TTC, paiements, valeur de stock au coût)',
  reference         VARCHAR(60)   NULL,
  description       VARCHAR(255)  NOT NULL,
  invoice_id        INT UNSIGNED  NULL,
  payment_id        INT UNSIGNED  NULL,
  stock_movement_id INT UNSIGNED  NULL,
  product_id        INT UNSIGNED  NULL,
  customer_id       INT UNSIGNED  NULL,
  supplier_id       INT UNSIGNED  NULL,
  user_id           INT UNSIGNED  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transactions_payment (payment_id),
  UNIQUE KEY uq_transactions_movement (stock_movement_id),
  KEY idx_transactions_date (transaction_date),
  KEY idx_transactions_type (type, transaction_date),
  KEY idx_transactions_invoice (invoice_id),
  CONSTRAINT fk_transactions_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id),
  CONSTRAINT fk_transactions_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_movement FOREIGN KEY (stock_movement_id) REFERENCES stock_movements (id),
  CONSTRAINT fk_transactions_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_transactions_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_transactions_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Données de référence (indispensables au fonctionnement)
-- ---------------------------------------------------------------------
INSERT INTO categories (id, name, description) VALUES
  (1, 'MDF', 'Panneaux MDF bruts, hydrofuges et mélaminés'),
  (2, 'Chants', 'Bandes de chant PVC / ABS'),
  (3, 'Colles et adhésifs', 'Colles vinyliques, néoprène, thermofusibles'),
  (4, 'Bois prédécoupé', 'Pièces de bois découpées à dimension pour menuisiers'),
  (5, 'Bois brut', 'Bois massif brut ou avivé'),
  (6, 'Autres matériaux', 'Quincaillerie, abrasifs et accessoires de menuiserie');

INSERT INTO vat_rates (id, label, rate, is_default, is_active) VALUES
  (1, 'TVA 19 %', 19.00, 1, 1),
  (2, 'TVA 13 %', 13.00, 0, 1),
  (3, 'TVA 7 %',   7.00, 0, 1),
  (4, 'Exonéré (0 %)', 0.00, 0, 1);

INSERT INTO settings (setting_key, setting_value) VALUES
  ('company_name',     'Ste Louati SOB'),
  ('company_activity', 'Vente de bois et de matériaux de menuiserie'),
  ('company_address',  'Adresse de la société (à configurer)'),
  ('company_phone',    '+216 00 000 000'),
  ('company_email',    'contact@exemple.tn'),
  ('company_tax_id',   '0000000X/A/M/000'),
  ('company_rib',      ''),
  ('currency',         'DT'),
  ('stamp_duty',       '1.000'),
  ('invoice_footer',   'Merci pour votre confiance.'),
  ('demo_mode',        '0');
