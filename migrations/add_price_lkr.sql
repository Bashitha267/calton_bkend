-- ============================================================
-- Migration: Add priceLKR column to products table
-- Run this in phpMyAdmin or MySQL CLI on Hostinger if not automatically created
-- ============================================================

ALTER TABLE `products`
ADD COLUMN `priceLKR` DECIMAL(12,2) DEFAULT NULL AFTER `priceAUD`;
