-- ============================================================
-- Migration: Add product_views tracking table
-- Run this in phpMyAdmin or MySQL CLI on Hostinger
-- ============================================================

CREATE TABLE IF NOT EXISTS `product_views` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId`   VARCHAR(50)     NOT NULL,
  `event`       ENUM('view','click','add_to_bag') NOT NULL,
  `sessionId`   VARCHAR(100)    DEFAULT NULL,   -- anonymous session fingerprint
  `country`     VARCHAR(100)    DEFAULT NULL,   -- from request or user profile
  `createdAt`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pv_product`    (`productId`),
  KEY `idx_pv_event`      (`event`),
  KEY `idx_pv_created`    (`createdAt`),
  KEY `idx_pv_product_event` (`productId`, `event`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
