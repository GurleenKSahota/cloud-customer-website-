const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection configuration
// You'll need to update these with your RDS credentials after provisioning
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'customer_website',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
});

async function runSchema() {
  console.log('Running schema...');
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schemaSQL);
  console.log('✓ Schema created');
}

async function populateProducts() {
  console.log('Populating products...');
  const productsData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8')
  );

  for (const product of productsData) {
    await pool.query(
      `INSERT INTO products (barcode, name, description, ingredients, price, image_url, product_line, primary_category, secondary_category, tertiary_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        product.barcode,
        product.name,
        product.description,
        product.ingredients,
        product.price,
        product.imageUrl,
        product.primaryCategory, // Using primaryCategory as product_line
        product.primaryCategory,
        product.secondaryCategory || null,
        product.tertiaryCategory || null,
      ]
    );
  }
  console.log(`✓ Inserted ${productsData.length} products`);
}

async function populateStores() {
  console.log('Populating stores...');
  const stores = [
    { name: "Capitol Hill Farmer's Market", address: '1401 Broadway, Seattle, WA 98122' },
    { name: "Kirkland Farmer's Market", address: '123 Central Way, Kirkland, WA 98033' },
    { name: "Bothell Farmer's Market", address: '18305 Bothell Way NE, Bothell, WA 98011' },
    { name: "Snohomish Farmer's Market", address: '1123 1st St, Snohomish, WA 98290' },
    { name: "Bellevue Farmer's Market", address: '575 Bellevue Square, Bellevue, WA 98004' },
  ];

  for (const store of stores) {
    await pool.query(
      'INSERT INTO stores (name, street_address) VALUES ($1, $2)',
      [store.name, store.address]
    );
  }
  console.log(`✓ Inserted ${stores.length} stores`);
}

async function populateInventory() {
  console.log('Populating inventory...');
  
  // Get all stores and products
  const storesResult = await pool.query('SELECT id FROM stores');
  const productsResult = await pool.query('SELECT id FROM products');
  
  const storeIds = storesResult.rows.map(r => r.id);
  const productIds = productsResult.rows.map(r => r.id);

  let inventoryCount = 0;
  
  // Each store will have most products, but with varying quantities
  for (const storeId of storeIds) {
    for (const productId of productIds) {
      // Randomly skip 20% of products to make inventory more realistic
      if (Math.random() < 0.2) continue;
      
      // Random quantity between 0 and 100
      const quantity = Math.floor(Math.random() * 101);
      
      await pool.query(
        'INSERT INTO inventory (store_id, product_id, quantity) VALUES ($1, $2, $3)',
        [storeId, productId, quantity]
      );
      inventoryCount++;
    }
  }
  console.log(`✓ Inserted ${inventoryCount} inventory entries`);
}

async function populateSales() {
  console.log('Populating sales...');
  
  // Get some product IDs for product-specific sales
  const productsResult = await pool.query(
    "SELECT id, name FROM products WHERE primary_category = 'Produce' LIMIT 3"
  );
  const produceIds = productsResult.rows.map(r => r.id);

  // Sale 1: Line-based sale on all Dairy products
  const dairySaleResult = await pool.query(
    `INSERT INTO sales (name, discount_percentage, product_line, is_active)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['Dairy Days', 15.0, 'Dairy', true]
  );
  console.log('  ✓ Created "Dairy Days" sale (15% off all Dairy)');

  // Sale 2: Line-based sale on Frozen products
  const frozenSaleResult = await pool.query(
    `INSERT INTO sales (name, discount_percentage, product_line, is_active)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['Frozen Food Week', 20.0, 'Frozen', true]
  );
  console.log('  ✓ Created "Frozen Food Week" sale (20% off all Frozen)');

  // Sale 3: Product-specific sale on selected produce items
  const produceSaleResult = await pool.query(
    `INSERT INTO sales (name, discount_percentage, is_active)
     VALUES ($1, $2, $3) RETURNING id`,
    ['Fresh Produce Special', 25.0, true]
  );
  const produceSaleId = produceSaleResult.rows[0].id;
  
  // Link specific products to this sale
  for (const productId of produceIds) {
    await pool.query(
      'INSERT INTO sale_products (sale_id, product_id) VALUES ($1, $2)',
      [produceSaleId, productId]
    );
  }
  console.log(`  ✓ Created "Fresh Produce Special" sale (25% off ${produceIds.length} products)`);

  // Sale 4: Inactive sale (to test filtering)
  await pool.query(
    `INSERT INTO sales (name, discount_percentage, product_line, is_active)
     VALUES ($1, $2, $3, $4)`,
    ['Past Holiday Sale', 30.0, 'Bakery', false]
  );
  console.log('  ✓ Created inactive "Past Holiday Sale"');
}

async function main() {
  try {
    console.log('Starting database population...\n');
    
    // Skip schema if SKIP_SCHEMA env var is set (user_data.sh runs it separately)
    if (!process.env.SKIP_SCHEMA) {
      await runSchema();
    } else {
      console.log('⊘ Skipping schema (SKIP_SCHEMA is set)');
    }
    
    await populateProducts();
    await populateStores();
    await populateInventory();
    await populateSales();
    
    console.log('\n✅ Database populated successfully!');
    
    // Show some stats
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM products) as products,
        (SELECT COUNT(*) FROM stores) as stores,
        (SELECT COUNT(*) FROM inventory) as inventory,
        (SELECT COUNT(*) FROM sales) as sales
    `);
    console.log('\nDatabase stats:', stats.rows[0]);
    
  } catch (error) {
    console.error('❌ Error populating database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main();
