-- ============================
-- BASE DE DATOS WHOLESALE (Railway)
-- SOLO ESTRUCTURA, SIN DATOS
-- ============================

-- Usar la BD que ya trae Railway
USE railway;

-- 1) TABLA users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100),
  email         VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_temp       TINYINT(1) DEFAULT 1,
  reset_token   VARCHAR(100) NULL,
  reset_expires DATETIME NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2) TABLA categories
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- 3) TABLA products
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL,
  image_url   VARCHAR(255),
  category_id INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 4) TABLA contacts
CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  whatsapp  VARCHAR(32),
  phone     VARCHAR(32),
  email     VARCHAR(120),
  facebook  VARCHAR(200),
  instagram VARCHAR(200),
  tiktok    VARCHAR(200),
  address   VARCHAR(200),
  visible   TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5) TABLA brand_settings
CREATE TABLE IF NOT EXISTS brand_settings (
  id TINYINT PRIMARY KEY,
  brand_name VARCHAR(150),
  tagline    VARCHAR(200),
  logo_url   VARCHAR(255),
  logo_mime  VARCHAR(100) NULL,
  logo_data  LONGBLOB NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 6) TABLA product_images
CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url  VARCHAR(255) NULL,
  mime       VARCHAR(100) NULL,
  data       LONGBLOB NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;
