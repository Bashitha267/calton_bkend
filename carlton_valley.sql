-- ============================================================
-- Carlton Valley E-Commerce — MySQL Import File
-- Import to Hostinger: phpMyAdmin > Import > select this file
-- Charset: utf8mb4 | Engine: InnoDB
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ─── USERS ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id`           VARCHAR(50)  NOT NULL,
  `username`     VARCHAR(100) NOT NULL,
  `email`        VARCHAR(255) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `name`         VARCHAR(255) NOT NULL,
  `role`         ENUM('admin','customer') NOT NULL DEFAULT 'customer',
  `phone`        VARCHAR(50)  DEFAULT NULL,
  `address`      TEXT         DEFAULT NULL,
  `avatar`       VARCHAR(500) DEFAULT NULL,
  `refreshToken` TEXT         DEFAULT NULL,
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email`    (`email`),
  UNIQUE KEY `uq_username` (`username`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id`            VARCHAR(50)    NOT NULL,
  `name`          VARCHAR(255)   NOT NULL,
  `priceAUD`      DECIMAL(10,2)  NOT NULL,
  `category`      VARCHAR(100)   NOT NULL,
  `badge`         VARCHAR(100)   DEFAULT NULL,
  `inStock`       TINYINT(1)     NOT NULL DEFAULT 1,
  `preOrder`      TINYINT(1)     NOT NULL DEFAULT 0,
  `isNewArrival`  TINYINT(1)     NOT NULL DEFAULT 0,
  `isComingSoon`  TINYINT(1)     NOT NULL DEFAULT 0,
  `rating`        DECIMAL(3,1)   NOT NULL DEFAULT 0.0,
  `reviewCount`   INT            NOT NULL DEFAULT 0,
  `createdAt`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category`    (`category`),
  KEY `idx_inStock`     (`inStock`),
  KEY `idx_isNewArrival`(`isNewArrival`),
  KEY `idx_isComingSoon`(`isComingSoon`),
  KEY `idx_createdAt`   (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PRODUCT DESCRIPTIONS ─────────────────────────────────────────────────
DROP TABLE IF EXISTS `product_descriptions`;
CREATE TABLE `product_descriptions` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `productId`   VARCHAR(50)  NOT NULL,
  `header`      VARCHAR(255) NOT NULL,
  `description` TEXT,
  `fit`         TEXT,
  `fabric`      TEXT,
  `details`     TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product` (`productId`),
  CONSTRAINT `fk_pd_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PRODUCT SIZES ────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `product_sizes`;
CREATE TABLE `product_sizes` (
  `id`        INT         NOT NULL AUTO_INCREMENT,
  `productId` VARCHAR(50) NOT NULL,
  `size`      VARCHAR(50) NOT NULL,
  `sortOrder` TINYINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ps_product` (`productId`),
  CONSTRAINT `fk_ps_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PRODUCT COLORS ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS `product_colors`;
CREATE TABLE `product_colors` (
  `id`          VARCHAR(50)  NOT NULL,
  `productId`   VARCHAR(50)  NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `hex`         VARCHAR(10)  DEFAULT NULL,
  `swatchImage` VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pc_product` (`productId`),
  CONSTRAINT `fk_pc_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PRODUCT COLOR IMAGES ─────────────────────────────────────────────────
-- Up to 6 images per color variant
DROP TABLE IF EXISTS `product_color_images`;
CREATE TABLE `product_color_images` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `colorId`   VARCHAR(50)  NOT NULL,
  `imageUrl`  VARCHAR(500) NOT NULL,
  `sortOrder` TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pci_color` (`colorId`),
  CONSTRAINT `fk_pci_color` FOREIGN KEY (`colorId`) REFERENCES `product_colors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── SHIPPING SECTIONS ────────────────────────────────────────────────────
DROP TABLE IF EXISTS `shipping_sections`;
CREATE TABLE `shipping_sections` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `productId` VARCHAR(50)  NOT NULL,
  `header`    VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ss_product` (`productId`),
  CONSTRAINT `fk_ss_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── SHIPPING POINTS ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS `shipping_points`;
CREATE TABLE `shipping_points` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `sectionId` INT          NOT NULL,
  `point`     TEXT         NOT NULL,
  `sortOrder` TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_sp_section` (`sectionId`),
  CONSTRAINT `fk_sp_section` FOREIGN KEY (`sectionId`) REFERENCES `shipping_sections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── REVIEWS ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `reviews`;
CREATE TABLE `reviews` (
  `id`              VARCHAR(50)  NOT NULL,
  `productId`       VARCHAR(50)  NOT NULL,
  `reviewerName`    VARCHAR(255) NOT NULL,
  `verified`        TINYINT(1)   NOT NULL DEFAULT 0,
  `date`            VARCHAR(20)  NOT NULL,
  `rating`          TINYINT      NOT NULL,
  `title`           VARCHAR(255) DEFAULT NULL,
  `comment`         TEXT         NOT NULL,
  `itemSize`        VARCHAR(10)  DEFAULT NULL,
  `itemColor`       VARCHAR(100) DEFAULT NULL,
  `mediaType`       ENUM('photo','video') DEFAULT NULL,
  `mediaUrl`        VARCHAR(500) DEFAULT NULL,
  `mediaThumbnail`  VARCHAR(500) DEFAULT NULL,
  `status`          ENUM('approved','pending','rejected') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `idx_rev_product` (`productId`),
  KEY `idx_rev_status`  (`status`),
  CONSTRAINT `fk_rev_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── CATEGORIES ───────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id`          VARCHAR(50)  NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `buttonText`  VARCHAR(100) NOT NULL,
  `image`       VARCHAR(500) DEFAULT NULL,
  `link`        VARCHAR(255) NOT NULL,
  `description` TEXT         DEFAULT NULL,
  `itemCount`   INT          NOT NULL DEFAULT 0,
  `sortOrder`   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_cat_sort` (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ORDERS ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id`              VARCHAR(50)    NOT NULL,
  `customerName`    VARCHAR(255)   NOT NULL,
  `customerEmail`   VARCHAR(255)   NOT NULL,
  `customerPhone`   VARCHAR(50)    DEFAULT NULL,
  `date`            VARCHAR(20)    NOT NULL,
  `totalAUD`        DECIMAL(10,2)  NOT NULL,
  `status`          ENUM('Pending','Processing','Shipped','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  `shippingAddress` TEXT           NOT NULL,
  `country`         ENUM('Sri Lanka','Australia') NOT NULL,
  `district`        VARCHAR(100)   NOT NULL,
  `paymentMethod`   VARCHAR(100)   NOT NULL,
  `trackingNumber`  VARCHAR(100)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ord_email`  (`customerEmail`),
  KEY `idx_ord_status` (`status`),
  KEY `idx_ord_date`   (`date`),
  KEY `idx_ord_country`(`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ORDER ITEMS ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `order_items`;
CREATE TABLE `order_items` (
  `id`          VARCHAR(50)    NOT NULL,
  `orderId`     VARCHAR(50)    NOT NULL,
  `productId`   VARCHAR(50)    NOT NULL,
  `productName` VARCHAR(255)   NOT NULL,
  `color`       VARCHAR(100)   NOT NULL,
  `size`        VARCHAR(10)    NOT NULL,
  `quantity`    INT            NOT NULL,
  `priceAUD`    DECIMAL(10,2)  NOT NULL,
  `image`       VARCHAR(500)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_oi_order`   (`orderId`),
  KEY `idx_oi_product` (`productId`),
  CONSTRAINT `fk_oi_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA
-- ============================================================

-- ─── Admin user (password: Admin@123) ────────────────────────────────────
-- Hash generated with bcrypt cost 10 for "Admin@123"
INSERT INTO `users` (`id`, `username`, `email`, `passwordHash`, `name`, `role`) VALUES
('usr-admin-1', 'admin', 'admin@carltonvalley.com',
 '$2a$10$iHueBB6i2vqEYK9ROOjKWORdKaIExw4NaWJ5Dxc3pzF9roYDj./WG', -- password: "Admin@123"
 'Admin', 'admin');

-- ─── Categories ───────────────────────────────────────────────────────────
INSERT INTO `categories` (`id`, `title`, `buttonText`, `image`, `link`, `description`, `itemCount`, `sortOrder`) VALUES
('cat-1', 'All Products',       'SHOP ALL',       '/images/cat_shop_all.jpg',     '/shop',                         'Explore the full Carlton Valley seasonal collection.', 12, 0),
('cat-2', 'Tops & Shirts',      'SHOP TOPS',      '/images/cat_shop_tops.jpg',    '/shop?category=Shirts',         'Relaxed silhouettes, botanical twills, and crisp cotton poplin.', 8, 1),
('cat-3', 'Bottoms & Trousers', 'SHOP BOTTOMS',   '/images/cat_shop_bottoms.jpg', '/shop?category=Bottoms & Trousers', 'Architectural pleats, tailored wide legs, and luxury drapery.', 4, 2),
('cat-4', 'Outerwear & Knits',  'SHOP OUTERWEAR', '/images/editorial_banner.jpg', '/shop?category=Outerwear',      'Cashmere knits, structured trenches, and virgin wool layers.', 3, 3);

-- ─── Products ─────────────────────────────────────────────────────────────
INSERT INTO `products` (`id`, `name`, `priceAUD`, `category`, `badge`, `inStock`, `preOrder`, `isNewArrival`, `isComingSoon`, `rating`, `reviewCount`, `createdAt`) VALUES
('prod-1', 'Relaxed Twill TENCEL™ Shirt',   220.00, 'Shirts',              'New Arrival',   1, 1, 1, 0, 5.0, 22, '2026-03-01 00:00:00'),
('prod-2', 'Pinstripe Boxy Shirt',           180.00, 'Shirts',              'Bestseller',    1, 0, 1, 0, 5.0,  8, '2026-03-05 00:00:00'),
('prod-3', 'Resort Collar Linen Shirt',      195.00, 'Shirts',              'Limited Drop',  1, 0, 1, 0, 4.9,  6, '2026-03-08 00:00:00'),
('prod-4', 'Architectural Pleated Trouser',  260.00, 'Bottoms & Trousers',  'New Arrival',   1, 0, 1, 0, 5.0, 14, '2026-03-02 00:00:00'),
('prod-5', 'Oversized Structured Wool Shirt',240.00, 'Shirts',              'Bestseller',    1, 0, 1, 0, 5.0, 10, '2026-03-04 00:00:00'),
('prod-6', 'Minimalist Poplin Overshirt',    210.00, 'Shirts',              'New Arrival',   1, 0, 1, 0, 5.0,  9, '2026-03-06 00:00:00'),
('cs-1',   'Double-Breasted Wool Trench',    380.00, 'Outerwear',           'Coming Soon',   0, 1, 0, 1, 5.0,  4, '2026-03-10 00:00:00'),
('cs-2',   'Sculpted Cashmere Knit',         290.00, 'Knits',               'Next Drop',     0, 1, 0, 1, 5.0,  2, '2026-03-12 00:00:00');

-- ─── Product Descriptions ─────────────────────────────────────────────────
INSERT INTO `product_descriptions` (`productId`, `header`, `description`, `fit`, `fabric`, `details`) VALUES
('prod-1', 'Relaxed Twill TENCEL™ Shirt',
 'Cut for a relaxed boxy drape, this modern silhouette is crafted from high-density botanical TENCEL™ lyocell twill.',
 'Boxy relaxed drape. Designed to sit effortlessly over casual or tailored trousers. Fits true to size for an oversized look.',
 '100% sustainable TENCEL™ Lyocell, 185 GSM high-twist twill weave.',
 'Genuine mother-of-pearl hardware buttons, convertible camp collar, single patch chest pocket, split side gussets, straight tailored hem.'),
('prod-2', 'Pinstripe Boxy Shirt',
 'Tailored from crisp Japanese cotton poplin with fine architectural pinstripes.',
 'Relaxed boxy cut with dropped shoulders.',
 '100% Japanese Cotton Poplin, 160 GSM.',
 'Reinforced collar stand, engraved dark horn buttons, clean hidden placket.'),
('prod-3', 'Resort Collar Linen Shirt',
 'Airy Normandy flax linen garment-washed for a super soft lived-in feel.',
 'Relaxed silhouette with open resort collar.',
 '100% French Normandy Flax Linen, pre-washed.',
 'Notch lapel collar, sustainable wood buttons, straight vent hem.'),
('prod-4', 'Architectural Pleated Trouser',
 'Double forward pleats with a dramatic wide taper. Tailored in an all-season wool blend.',
 'High rise with deep pleats and sweeping wide leg profile.',
 '65% Virgin Wool, 35% Lyocell blend.',
 'Extended waistband with hook-and-bar closure, rear welt pockets, blind stitched hem.'),
('prod-5', 'Oversized Structured Wool Shirt',
 'Mid-weight merino wool overshirt designed to be worn standalone or layered over fine knitwear.',
 'Structured boxy fit with generous body volume.',
 '100% Merino Wool, 260 GSM brushed twill.',
 'Matte metal snap buttons, dual chest patch pockets with flap, locker loop.'),
('prod-6', 'Minimalist Poplin Overshirt',
 'Clean lines and concealed front placket make this minimalist overshirt a modern wardrobe staple.',
 'Regular straight fit.',
 '100% Organic Egyptian Cotton Poplin.',
 'Concealed front button placket, buttoned cuffs, curved hemline.'),
('cs-1', 'Double-Breasted Wool Trench',
 'An iconic statement trench coat featuring a sharp wide lapel, storm flap, and belted waist.',
 'Oversized longline silhouette with raglan sleeves.',
 '80% Virgin Wool, 20% Cashmere blend.',
 'Horn buttons, storm flap, removable tie belt, fully lined with cupro silk.'),
('cs-2', 'Sculpted Cashmere Knit',
 'Pure Mongolian cashmere spun into a ribbed crewneck with architectural volume sleeves.',
 'Sculpted relaxed fit.',
 '100% Grade-A Mongolian Cashmere, 7-gauge knit.',
 'Ribbed neckline, drop shoulder contour, seamless tubular cuffs.');

-- ─── Product Sizes ────────────────────────────────────────────────────────
INSERT INTO `product_sizes` (`productId`, `size`, `sortOrder`) VALUES
('prod-1','XS',0),('prod-1','S',1),('prod-1','M',2),('prod-1','L',3),('prod-1','XL',4),('prod-1','2XL',5),
('prod-2','XS',0),('prod-2','S',1),('prod-2','M',2),('prod-2','L',3),('prod-2','XL',4),
('prod-3','S',0),('prod-3','M',1),('prod-3','L',2),('prod-3','XL',3),('prod-3','2XL',4),
('prod-4','XS',0),('prod-4','S',1),('prod-4','M',2),('prod-4','L',3),('prod-4','XL',4),
('prod-5','S',0),('prod-5','M',1),('prod-5','L',2),('prod-5','XL',3),('prod-5','2XL',4),
('prod-6','XS',0),('prod-6','S',1),('prod-6','M',2),('prod-6','L',3),('prod-6','XL',4),
('cs-1','S',0),('cs-1','M',1),('cs-1','L',2),('cs-1','XL',3),
('cs-2','XS',0),('cs-2','S',1),('cs-2','M',2),('cs-2','L',3),('cs-2','XL',4);

-- ─── Product Colors ───────────────────────────────────────────────────────
INSERT INTO `product_colors` (`id`, `productId`, `name`, `hex`, `swatchImage`) VALUES
('col-black',      'prod-1', 'Black',          '#111111', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=300&auto=format&fit=crop'),
('col-white',      'prod-1', 'Bone White',     '#F4F2EC', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=300&auto=format&fit=crop'),
('col-pinstripe',  'prod-1', 'Pinstripe Check','#2B3545', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=300&auto=format&fit=crop'),
('col-navy-stripe','prod-2', 'Navy Pinstripe', '#1A2535', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=300&auto=format&fit=crop'),
('col-linen-sand', 'prod-3', 'Sand Beige',     '#D6C7B2', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=300&auto=format&fit=crop'),
('col-charcoal',   'prod-4', 'Charcoal Slate', '#33373D', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=300&auto=format&fit=crop'),
('col-olive-wool', 'prod-5', 'Deep Olive',     '#3B4136', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=300&auto=format&fit=crop'),
('col-taupe',      'prod-6', 'Warm Taupe',     '#8C8275', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=300&auto=format&fit=crop'),
('col-camel',      'cs-1',   'Camel',          '#C19A6B', 'https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=300&auto=format&fit=crop'),
('col-cream-knit', 'cs-2',   'Alabaster Cream','#EFECE6', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=300&auto=format&fit=crop');

-- ─── Product Color Images ─────────────────────────────────────────────────
INSERT INTO `product_color_images` (`colorId`, `imageUrl`, `sortOrder`) VALUES
('col-black', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=1200&auto=format&fit=crop', 0),
('col-black', 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?q=80&w=1200&auto=format&fit=crop', 1),
('col-black', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1200&auto=format&fit=crop', 2),
('col-black', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=1200&auto=format&fit=crop', 3),
('col-black', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1200&auto=format&fit=crop', 4),
('col-black', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1200&auto=format&fit=crop', 5),
('col-white', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=1200&auto=format&fit=crop', 0),
('col-white', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=1200&auto=format&fit=crop', 1),
('col-white', 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?q=80&w=1200&auto=format&fit=crop', 2),
('col-white', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=1200&auto=format&fit=crop', 3),
('col-white', 'https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=1200&auto=format&fit=crop', 4),
('col-white', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=1200&auto=format&fit=crop', 5),
('col-pinstripe', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=1200&auto=format&fit=crop', 0),
('col-pinstripe', 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?q=80&w=1200&auto=format&fit=crop', 1),
('col-pinstripe', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?q=80&w=1200&auto=format&fit=crop', 2),
('col-pinstripe', 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=1200&auto=format&fit=crop', 3),
('col-navy-stripe','https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=1200&auto=format&fit=crop', 0),
('col-navy-stripe','https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1200&auto=format&fit=crop', 1),
('col-navy-stripe','https://images.unsplash.com/photo-1598033129183-c4f50c736f10?q=80&w=1200&auto=format&fit=crop', 2),
('col-navy-stripe','https://images.unsplash.com/photo-1516257984-b1b4d707412e?q=80&w=1200&auto=format&fit=crop', 3),
('col-linen-sand', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=1200&auto=format&fit=crop', 0),
('col-linen-sand', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=1200&auto=format&fit=crop', 1),
('col-linen-sand', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=1200&auto=format&fit=crop', 2),
('col-charcoal',   'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1200&auto=format&fit=crop', 0),
('col-charcoal',   'https://images.unsplash.com/photo-1516257984-b1b4d707412e?q=80&w=1200&auto=format&fit=crop', 1),
('col-olive-wool', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=1200&auto=format&fit=crop', 0),
('col-olive-wool', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1200&auto=format&fit=crop', 1),
('col-taupe',      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1200&auto=format&fit=crop', 0),
('col-taupe',      'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=1200&auto=format&fit=crop', 1),
('col-camel',      'https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=1200&auto=format&fit=crop', 0),
('col-camel',      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=1200&auto=format&fit=crop', 1),
('col-cream-knit', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=1200&auto=format&fit=crop', 0),
('col-cream-knit', 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?q=80&w=1200&auto=format&fit=crop', 1);

-- ─── Shipping Sections ────────────────────────────────────────────────────
INSERT INTO `shipping_sections` (`productId`, `header`) VALUES
('prod-1','Shipping'),('prod-1','Australia'),
('prod-2','Shipping'),('prod-2','Australia'),
('prod-3','Shipping'),('prod-3','Australia'),
('prod-4','Shipping'),('prod-4','Australia'),
('prod-5','Shipping'),('prod-5','Australia'),
('prod-6','Shipping'),('prod-6','Australia'),
('cs-1','Shipping'),('cs-1','Australia'),
('cs-2','Shipping'),('cs-2','Australia');

-- ─── Shipping Points (section IDs assumed sequential) ─────────────────────
-- NOTE: If section IDs differ after import, re-run or update manually.
-- These are for sections 1,3,5,7,9,11,13,15 (Shipping) and 2,4,6,8,10,12,14,16 (Australia)
INSERT INTO `shipping_points` (`sectionId`, `point`, `sortOrder`) VALUES
(1,'Orders ship from Sydney, Australia',0),(1,'Please allow 1–2 business days for processing',1),(1,'Orders placed before 2pm AEST dispatch same business day',2),(1,'Tracking details sent once your order ships',3),
(2,'Free standard shipping on orders over $200 AUD',0),(2,'Standard shipping (2–5 business days): $10 AUD',1),(2,'Express Shipping (1–2 business days): $15 AUD',2),
(3,'Orders ship from Sydney, Australia',0),(3,'Please allow 1–2 business days for processing',1),(3,'Orders placed before 2pm AEST dispatch same business day',2),(3,'Tracking details sent once your order ships',3),
(4,'Free standard shipping on orders over $200 AUD',0),(4,'Standard shipping (2–5 business days): $10 AUD',1),(4,'Express Shipping (1–2 business days): $15 AUD',2),
(5,'Orders ship from Sydney, Australia',0),(5,'Please allow 1–2 business days for processing',1),(5,'Orders placed before 2pm AEST dispatch same business day',2),(5,'Tracking details sent once your order ships',3),
(6,'Free standard shipping on orders over $200 AUD',0),(6,'Standard shipping (2–5 business days): $10 AUD',1),(6,'Express Shipping (1–2 business days): $15 AUD',2),
(7,'Orders ship from Sydney, Australia',0),(7,'Please allow 1–2 business days for processing',1),(7,'Orders placed before 2pm AEST dispatch same business day',2),(7,'Tracking details sent once your order ships',3),
(8,'Free standard shipping on orders over $200 AUD',0),(8,'Standard shipping (2–5 business days): $10 AUD',1),(8,'Express Shipping (1–2 business days): $15 AUD',2),
(9,'Orders ship from Sydney, Australia',0),(9,'Please allow 1–2 business days for processing',1),(9,'Orders placed before 2pm AEST dispatch same business day',2),(9,'Tracking details sent once your order ships',3),
(10,'Free standard shipping on orders over $200 AUD',0),(10,'Standard shipping (2–5 business days): $10 AUD',1),(10,'Express Shipping (1–2 business days): $15 AUD',2),
(11,'Orders ship from Sydney, Australia',0),(11,'Please allow 1–2 business days for processing',1),(11,'Orders placed before 2pm AEST dispatch same business day',2),(11,'Tracking details sent once your order ships',3),
(12,'Free standard shipping on orders over $200 AUD',0),(12,'Standard shipping (2–5 business days): $10 AUD',1),(12,'Express Shipping (1–2 business days): $15 AUD',2),
(13,'Orders ship from Sydney, Australia',0),(13,'Please allow 1–2 business days for processing',1),(13,'Orders placed before 2pm AEST dispatch same business day',2),(13,'Tracking details sent once your order ships',3),
(14,'Free standard shipping on orders over $200 AUD',0),(14,'Standard shipping (2–5 business days): $10 AUD',1),(14,'Express Shipping (1–2 business days): $15 AUD',2),
(15,'Orders ship from Sydney, Australia',0),(15,'Please allow 1–2 business days for processing',1),(15,'Orders placed before 2pm AEST dispatch same business day',2),(15,'Tracking details sent once your order ships',3),
(16,'Free standard shipping on orders over $200 AUD',0),(16,'Standard shipping (2–5 business days): $10 AUD',1),(16,'Express Shipping (1–2 business days): $15 AUD',2);

-- ─── Reviews ──────────────────────────────────────────────────────────────
INSERT INTO `reviews` (`id`, `productId`, `reviewerName`, `verified`, `date`, `rating`, `title`, `comment`, `itemSize`, `itemColor`, `mediaType`, `mediaUrl`, `mediaThumbnail`, `status`) VALUES
('rev-1',   'prod-1', 'Darius H.',  1, '3/24/2026', 5, 'Exceptional quality and drape',     'Loved the shirt! Has a nice silk like feel. Very light weight especially for summer weather.', 'S', 'Black',       'video', 'https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-the-sun-in-a-field-42861-large.mp4', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=500', 'approved'),
('rev-2',   'prod-1', 'Marcus K.',  1, '3/18/2026', 5, 'Perfection in craftsmanship',        'The TENCEL fabric is unlike anything else on the market. Heavy enough to drape with structure.', 'M', 'Bone White',  'photo', 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?q=80&w=800', 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?q=80&w=500', 'approved'),
('rev-3',   'prod-1', 'Julian V.',  1, '3/10/2026', 5, 'Great everyday luxury piece',        'Wore this to an art gallery opening in Melbourne and got constant compliments.', 'L', 'Black',       NULL,    NULL, NULL, 'approved'),
('rev-201', 'prod-2', 'Liam T.',    1, '3/20/2026', 5, NULL,                                  'Crisp cotton with fantastic structure. Looks very sharp paired with relaxed trousers.', 'M', 'Navy Pinstripe', NULL, NULL, NULL, 'approved');

-- ─── Sample Orders ────────────────────────────────────────────────────────
INSERT INTO `orders` (`id`, `customerName`, `customerEmail`, `customerPhone`, `date`, `totalAUD`, `status`, `shippingAddress`, `country`, `district`, `paymentMethod`, `trackingNumber`) VALUES
('ORD-9482', 'Ethan Vance',    'ethan.vance@example.com', '+61 412 345 678', '2026-03-24 14:32', 440.00, 'Processing', '42 Crown Street, Surry Hills NSW 2010',          'Australia', 'New South Wales (NSW)', 'Afterpay', NULL),
('ORD-9481', 'Chloe Davenport','chloe.d@example.com',     '+61 488 912 340', '2026-03-24 11:15', 260.00, 'Shipped',    '18 Flinders Lane, Melbourne VIC 3000',           'Australia', 'Victoria (VIC)',        'Credit Card (Stripe)', 'AUS-992384102AU'),
('ORD-9480', 'Nimal Perera',   'nimal.p@example.com',     '+94 77 123 4567', '2026-03-23 18:40', 400.00, 'Delivered',  'No. 45, Galle Road, Colombo 03, Sri Lanka',      'Sri Lanka', 'Colombo',              'PayPal', 'DHL-8472910398'),
('ORD-9479', 'Sienna Rossi',   'sienna.rossi@studio.com', NULL,             '2026-03-22 09:20', 180.00, 'Pending',    '77 Ocean Ave, Double Bay NSW 2028, Australia',   'Australia', 'New South Wales (NSW)', 'Apple Pay', NULL);

INSERT INTO `order_items` (`id`, `orderId`, `productId`, `productName`, `color`, `size`, `quantity`, `priceAUD`, `image`) VALUES
('item-9482-1','ORD-9482','prod-1','Relaxed Twill TENCEL™ Shirt','Black','M',2,220.00,'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=300'),
('item-9481-1','ORD-9481','prod-4','Architectural Pleated Trouser','Charcoal Slate','S',1,260.00,'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=300'),
('item-9480-1','ORD-9480','prod-1','Relaxed Twill TENCEL™ Shirt','Bone White','L',1,220.00,'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=300'),
('item-9480-2','ORD-9480','prod-2','Pinstripe Boxy Shirt','Navy Pinstripe','L',1,180.00,'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=300'),
('item-9479-1','ORD-9479','prod-2','Pinstripe Boxy Shirt','Navy Pinstripe','XS',1,180.00,'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=300');

-- ─── HOMEPAGE VIDEOS ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS `homepage_videos`;
CREATE TABLE `homepage_videos` (
  `id`          VARCHAR(50)  NOT NULL,
  `sectionKey`  VARCHAR(50)  NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `subtitle`    VARCHAR(255) DEFAULT NULL,
  `description` TEXT         DEFAULT NULL,
  `videoUrl`    VARCHAR(500) NOT NULL,
  `posterUrl`   VARCHAR(500) DEFAULT NULL,
  `isActive`    TINYINT(1)   NOT NULL DEFAULT 1,
  `updatedAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sectionKey` (`sectionKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `homepage_videos` (`id`, `sectionKey`, `title`, `subtitle`, `description`, `videoUrl`, `isActive`) VALUES
('vid-hero',     'hero',     'Hero Background Video',  'Hero Header Section',       'Main fullscreen background loop video displayed on the top hero banner.',                    '/hero1.mp4', 1),
('vid-featured', 'featured', 'Featured Editorial Video', 'Featured Brand Story Section', 'Portrait aspect ratio editorial story video showcasing luxury tailoring and natural textiles.', '/hero2.mp4', 1);

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- Import complete. Change the admin password hash after import!
-- Generate a new hash: node -e "const b=require('bcryptjs');console.log(b.hashSync('YourNewPassword',10))"
-- ============================================================
