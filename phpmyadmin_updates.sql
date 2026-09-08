-- ============================================================
-- Carlton Valley E-Commerce — phpMyAdmin SQL Update Script
-- Copy and paste this into Hostinger phpMyAdmin > SQL tab
-- ============================================================

-- 1. Ensure `country` column exists on `users` table
-- Note: If your MySQL version does not support IF NOT EXISTS in ALTER TABLE, 
-- use: ALTER TABLE `users` ADD COLUMN `country` VARCHAR(100) NOT NULL DEFAULT 'Australia' AFTER `role`;
SET @dbname = DATABASE();
SET @tablename = "users";
SET @columnname = "country";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `users` ADD COLUMN `country` VARCHAR(100) NOT NULL DEFAULT 'Australia' AFTER `role`, ADD INDEX `idx_country` (`country`)"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Create `community_spotlight` table for Homepage Management
CREATE TABLE IF NOT EXISTS `community_spotlight` (
  `id`            VARCHAR(50)  NOT NULL,
  `username`      VARCHAR(100) NOT NULL,
  `image`         VARCHAR(500) NOT NULL,
  `productTagged` VARCHAR(255) DEFAULT NULL,
  `link`          VARCHAR(500) DEFAULT NULL,
  `sortOrder`     INT          NOT NULL DEFAULT 0,
  `isActive`      TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active` (`isActive`),
  KEY `idx_sort`   (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Populate default initial Community Spotlight items
INSERT INTO `community_spotlight` (`id`, `username`, `image`, `productTagged`, `link`, `sortOrder`, `isActive`) VALUES
('spot-1', '@alex.carlton', '/images/community_1.jpg', 'Relaxed Twill TENCEL™ Shirt', '/shop', 1, 1),
('spot-2', '@marcus.style', '/images/community_2.jpg', 'Pinstripe Boxy Shirt', '/shop', 2, 1),
('spot-3', '@elena.noir', '/images/community_3.jpg', 'Architectural Pleated Trouser', '/shop', 3, 1),
('spot-4', '@julian.v', '/images/community_4.jpg', 'Resort Collar Linen Shirt', '/shop', 4, 1),
('spot-5', '@sophia.mode', '/images/community_5.jpg', 'Oversized Structured Wool Shirt', '/shop', 5, 1),
('spot-6', '@david.luxe', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1000&auto=format&fit=crop', 'Minimalist Poplin Overshirt', '/shop', 6, 1)
ON DUPLICATE KEY UPDATE `username` = VALUES(`username`);

-- 4. Ensure `targetCountries` column exists on `products` table
SET @coltarget = "targetCountries";
SET @prepProd = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = "products"
      AND COLUMN_NAME = @coltarget
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `products` ADD COLUMN `targetCountries` VARCHAR(255) DEFAULT '[\"Australia\", \"Sri Lanka\"]' AFTER `isComingSoon`"
));
PREPARE alterProd FROM @prepProd;
EXECUTE alterProd;
DEALLOCATE PREPARE alterProd;
