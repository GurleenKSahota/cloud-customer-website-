-- Drop tables if they exist (for clean re-runs)
DROP TABLE IF EXISTS generated_reports CASCADE;
DROP TABLE IF EXISTS report_schedules CASCADE;
DROP TABLE IF EXISTS deduction_log CASCADE;
DROP TABLE IF EXISTS sale_products CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS stores CASCADE;

-- Products table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    ingredients TEXT[], -- Array of ingredients
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(500),
    product_line VARCHAR(100), -- NEW: For line-based sales (e.g., "Produce", "Dairy")
    primary_category VARCHAR(100),
    secondary_category VARCHAR(100),
    tertiary_category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on product_line for efficient sale queries
CREATE INDEX idx_products_product_line ON products(product_line);
CREATE INDEX idx_products_barcode ON products(barcode);

-- Stores table
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    street_address VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory table (which products are at which stores and how many)
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, product_id) -- Each store can only have one inventory entry per product
);

-- Create composite index for efficient inventory lookups
CREATE INDEX idx_inventory_store_product ON inventory(store_id, product_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);

-- Sales table
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    discount_percentage DECIMAL(5, 2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
    product_line VARCHAR(100), -- If set, sale applies to all products in this line
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP, -- NULL means no end date
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_product_line ON sales(product_line) WHERE is_active = true;
CREATE INDEX idx_sales_active ON sales(is_active);

-- Junction table for sales that apply to specific products
CREATE TABLE sale_products (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(sale_id, product_id)
);

CREATE INDEX idx_sale_products_product ON sale_products(product_id);
CREATE INDEX idx_sale_products_sale ON sale_products(sale_id);

-- Deduction log — records every POS deduction with price at time of sale
CREATE TABLE deduction_log (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    deducted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deduction_log_deducted_at ON deduction_log(deducted_at);
CREATE INDEX idx_deduction_log_store ON deduction_log(store_id);
CREATE INDEX idx_deduction_log_product ON deduction_log(product_id);
CREATE INDEX idx_deduction_log_store_time ON deduction_log(store_id, deducted_at);

-- Report schedules — recurring report configurations
CREATE TABLE report_schedules (
    id SERIAL PRIMARY KEY,
    lookback_window VARCHAR(20) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    filter_type VARCHAR(20),
    filter_value VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP
);

-- Generated reports — CSV content stored per schedule run
CREATE TABLE generated_reports (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,
    csv_content TEXT NOT NULL,
    report_start TIMESTAMP NOT NULL,
    report_end TIMESTAMP NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_generated_reports_schedule ON generated_reports(schedule_id);
CREATE INDEX idx_generated_reports_generated_at ON generated_reports(generated_at);
