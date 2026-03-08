const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'customer_website',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

// --- Helper: Get unit price with active sale discounts applied ---
async function getUnitPrice(dbClient, barcode) {
  const result = await dbClient.query(
    `SELECT p.price,
            COALESCE(MAX(s.discount_percentage), 0) AS discount
     FROM products p
     LEFT JOIN sale_products sp ON sp.product_id = p.id
     LEFT JOIN sales s ON (s.id = sp.sale_id OR s.product_line = p.product_line)
       AND s.is_active = true
     WHERE p.barcode = $1
     GROUP BY p.id`,
    [barcode]
  );
  if (result.rows.length === 0) return null;
  const { price, discount } = result.rows[0];
  return discount > 0
    ? +(parseFloat(price) * (1 - parseFloat(discount) / 100)).toFixed(2)
    : +parseFloat(price);
}

// --- Helper: Log a deduction to deduction_log ---
async function logDeduction(dbClient, storeId, barcode, quantity, unitPrice) {
  await dbClient.query(
    `INSERT INTO deduction_log (store_id, product_id, quantity, unit_price)
     SELECT $1, p.id, $2, $3
     FROM products p WHERE p.barcode = $4`,
    [storeId, quantity, unitPrice, barcode]
  );
}

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Endpoint: Check if store has at least N of a product ---
// GET /inventory/check?storeId=1&barcode=ABC123&quantity=5

app.get('/inventory/check', async (req, res) => {
  try {
    const { storeId, barcode, quantity } = req.query;

    if (!storeId || !barcode || !quantity) {
      return res.status(400).json({ error: 'Missing required parameters: storeId, barcode, quantity' });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative integer' });
    }

    const result = await pool.query(
      `SELECT i.quantity
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       WHERE i.store_id = $1 AND p.barcode = $2`,
      [storeId, barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found in this store's inventory" });
    }

    const currentQty = result.rows[0].quantity;
    return res.json({
      storeId: parseInt(storeId),
      barcode,
      quantityRequested: qty,
      quantityAvailable: currentQty,
      inStock: currentQty >= qty,
    });
  } catch (err) {
    console.error('Error in /inventory/check:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Endpoint: Get price of a product at a store (with sales applied) ---
// GET /inventory/price?storeId=1&barcode=ABC123

app.get('/inventory/price', async (req, res) => {
  try {
    const { storeId, barcode } = req.query;

    if (!storeId || !barcode) {
      return res.status(400).json({ error: 'Missing required parameters: storeId, barcode' });
    }

    // Check product exists in this store's inventory
    const invResult = await pool.query(
      `SELECT i.quantity
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       WHERE i.store_id = $1 AND p.barcode = $2`,
      [storeId, barcode]
    );

    if (invResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found in this store's inventory" });
    }

    // Get product with highest applicable discount (same logic as website server)
    const result = await pool.query(
      `SELECT
         p.barcode,
         p.name,
         p.price,
         COALESCE(MAX(s.discount_percentage), 0) AS "discountPercentage"
       FROM products p
       LEFT JOIN sale_products sp ON sp.product_id = p.id
       LEFT JOIN sales s ON (s.id = sp.sale_id OR s.product_line = p.product_line)
         AND s.is_active = true
       WHERE p.barcode = $1
       GROUP BY p.id, p.barcode, p.name, p.price`,
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    const originalPrice = parseFloat(product.price);
    const discount = parseFloat(product.discountPercentage);
    const finalPrice = discount > 0
      ? parseFloat((originalPrice * (1 - discount / 100)).toFixed(2))
      : originalPrice;

    return res.json({
      storeId: parseInt(storeId),
      barcode: product.barcode,
      name: product.name,
      originalPrice,
      discountPercentage: discount,
      finalPrice,
    });
  } catch (err) {
    console.error('Error in /inventory/price:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Endpoint: Deduct quantity of a single product ---
// POST /inventory/deduct  body: { storeId, barcode, quantity }

app.post('/inventory/deduct', async (req, res) => {
  const client = await pool.connect();
  try {
    const { storeId, barcode, quantity } = req.body;

    if (!storeId || !barcode || !quantity) {
      return res.status(400).json({ error: 'Missing required fields: storeId, barcode, quantity' });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    await client.query('BEGIN');

    // Atomic: deduct only if enough stock exists
    const result = await client.query(
      `UPDATE inventory
       SET quantity = quantity - $1, last_updated = CURRENT_TIMESTAMP
       FROM products p
       WHERE inventory.product_id = p.id
         AND inventory.store_id = $2
         AND p.barcode = $3
         AND inventory.quantity >= $1
       RETURNING inventory.quantity AS "remainingQuantity"`,
      [qty, storeId, barcode]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      // Determine why it failed — product not found or insufficient stock
      const check = await pool.query(
        `SELECT i.quantity
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         WHERE i.store_id = $1 AND p.barcode = $2`,
        [storeId, barcode]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ error: "Product not found in this store's inventory" });
      }
      return res.status(409).json({
        error: 'Insufficient inventory',
        quantityAvailable: check.rows[0].quantity,
        quantityRequested: qty,
      });
    }

    // Log the deduction with sale price
    const unitPrice = await getUnitPrice(client, barcode);
    await logDeduction(client, storeId, barcode, qty, unitPrice);

    await client.query('COMMIT');

    return res.json({
      storeId: parseInt(storeId),
      barcode,
      quantityDeducted: qty,
      remainingQuantity: result.rows[0].remainingQuantity,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in /inventory/deduct:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// --- Endpoint: Deduct quantities of multiple products in one batch ---
// POST /inventory/deduct-batch  body: { storeId, items: [{ barcode, quantity }, ...] }

app.post('/inventory/deduct-batch', async (req, res) => {
  try {
    const { storeId, items } = req.body;

    if (!storeId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: storeId, items (non-empty array)' });
    }

    // Validate all items upfront
    for (const item of items) {
      if (!item.barcode || !item.quantity) {
        return res.status(400).json({ error: 'Each item must have barcode and quantity' });
      }
      const qty = parseInt(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for barcode ${item.barcode}: must be a positive integer` });
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const results = [];

      for (const item of items) {
        const qty = parseInt(item.quantity);

        const result = await client.query(
          `UPDATE inventory
           SET quantity = quantity - $1, last_updated = CURRENT_TIMESTAMP
           FROM products p
           WHERE inventory.product_id = p.id
             AND inventory.store_id = $2
             AND p.barcode = $3
             AND inventory.quantity >= $1
           RETURNING inventory.quantity AS "remainingQuantity"`,
          [qty, storeId, item.barcode]
        );

        if (result.rows.length === 0) {
          // Rollback entire batch
          await client.query('ROLLBACK');

          const check = await client.query(
            `SELECT i.quantity
             FROM inventory i
             JOIN products p ON p.id = i.product_id
             WHERE i.store_id = $1 AND p.barcode = $2`,
            [storeId, item.barcode]
          );

          if (check.rows.length === 0) {
            return res.status(404).json({
              error: `Product with barcode ${item.barcode} not found in this store's inventory`,
            });
          }
          return res.status(409).json({
            error: `Insufficient inventory for barcode ${item.barcode}`,
            quantityAvailable: check.rows[0].quantity,
            quantityRequested: qty,
          });
        }

        // Log deduction with sale price
        const unitPrice = await getUnitPrice(client, item.barcode);
        await logDeduction(client, storeId, item.barcode, qty, unitPrice);

        results.push({
          barcode: item.barcode,
          quantityDeducted: qty,
          remainingQuantity: result.rows[0].remainingQuantity,
        });
      }

      await client.query('COMMIT');

      return res.json({
        storeId: parseInt(storeId),
        itemsDeducted: results,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error in /inventory/deduct-batch:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Endpoint: Restock inventory ---
// POST /inventory/restock  body: { amount, storeId? }

app.post('/inventory/restock', async (req, res) => {
  try {
    const { amount, storeId } = req.body;

    if (!amount || parseInt(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer' });
    }

    const qty = parseInt(amount);
    let result;

    if (storeId) {
      result = await pool.query(
        `UPDATE inventory SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP
         WHERE store_id = $2
         RETURNING id`,
        [qty, parseInt(storeId)]
      );
    } else {
      result = await pool.query(
        `UPDATE inventory SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP
         RETURNING id`,
        [qty]
      );
    }

    return res.json({
      message: 'Inventory restocked successfully',
      itemsRestocked: result.rowCount,
      amountAdded: qty,
    });
  } catch (err) {
    console.error('Error in /inventory/restock:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Endpoint: List available products with store info (for traffic generator) ---
// GET /inventory/products

app.get('/inventory/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.barcode, i.store_id AS "storeId", p.name, i.quantity
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       WHERE i.quantity > 0
       ORDER BY p.name, i.store_id`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Error in /inventory/products:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`POS inventory service running on port ${PORT}`);
});
