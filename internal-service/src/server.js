const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- Cognito JWT Verification ---

const COGNITO_REGION = process.env.AWS_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const jwksUri = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

const client = jwksClient({
    jwksUri: jwksUri,
    cache: true,
    rateLimit: true,
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
    }, (err, decoded) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
}

// --- Serve static files (login page is public) ---
app.use(express.static(path.join(__dirname, '../public')));

// --- API config endpoint (public — returns Cognito config for the frontend) ---
app.get('/api/config', (req, res) => {
    res.json({
        region: COGNITO_REGION,
        userPoolId: COGNITO_USER_POOL_ID,
        clientId: COGNITO_CLIENT_ID,
    });
});

// --- All /api routes below require authentication ---

// GET /api/stores — List all stores
app.get('/api/stores', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, street_address as "streetAddress" FROM stores ORDER BY name'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stores:', error);
        res.status(500).json({ error: 'Failed to fetch stores' });
    }
});

// GET /api/products — List all products in catalog (for "add product" dropdown)
app.get('/api/products', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, barcode, name, price, product_line as "productLine" FROM products ORDER BY name'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// GET /api/stores/:storeId/inventory — List all products stocked by a store
app.get('/api/stores/:storeId/inventory', verifyToken, async (req, res) => {
    try {
        const storeId = parseInt(req.params.storeId);
        if (isNaN(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        const result = await pool.query(
            `SELECT 
        i.product_id as "productId",
        i.quantity,
        i.last_updated as "lastUpdated",
        p.barcode,
        p.name,
        p.price,
        p.product_line as "productLine"
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.store_id = $1
      ORDER BY p.name`,
            [storeId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching store inventory:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// PUT /api/stores/:storeId/inventory/:productId — Edit quantity
app.put('/api/stores/:storeId/inventory/:productId', verifyToken, async (req, res) => {
    try {
        const storeId = parseInt(req.params.storeId);
        const productId = parseInt(req.params.productId);
        const { quantity } = req.body;

        if (isNaN(storeId) || isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid store ID or product ID' });
        }

        if (quantity === undefined || quantity === null) {
            return res.status(400).json({ error: 'quantity is required' });
        }

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty < 0) {
            return res.status(400).json({ error: 'quantity must be a non-negative integer' });
        }

        const result = await pool.query(
            `UPDATE inventory 
       SET quantity = $1, last_updated = CURRENT_TIMESTAMP
       WHERE store_id = $2 AND product_id = $3
       RETURNING quantity, last_updated as "lastUpdated"`,
            [qty, storeId, productId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found in this store\'s inventory' });
        }

        res.json({
            storeId,
            productId,
            quantity: result.rows[0].quantity,
            lastUpdated: result.rows[0].lastUpdated,
        });
    } catch (error) {
        console.error('Error updating inventory:', error);
        res.status(500).json({ error: 'Failed to update inventory' });
    }
});

// POST /api/stores/:storeId/inventory — Add a product to store inventory
app.post('/api/stores/:storeId/inventory', verifyToken, async (req, res) => {
    try {
        const storeId = parseInt(req.params.storeId);
        const { productId, quantity } = req.body;

        if (isNaN(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        if (!productId) {
            return res.status(400).json({ error: 'productId is required' });
        }

        const pid = parseInt(productId);
        if (isNaN(pid)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        const qty = parseInt(quantity || 0);
        if (isNaN(qty) || qty < 0) {
            return res.status(400).json({ error: 'quantity must be a non-negative integer' });
        }

        // Check if product exists in catalog
        const productCheck = await pool.query('SELECT id, name FROM products WHERE id = $1', [pid]);
        if (productCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found in catalog' });
        }

        // Check if already stocked
        const existingCheck = await pool.query(
            'SELECT id FROM inventory WHERE store_id = $1 AND product_id = $2',
            [storeId, pid]
        );
        if (existingCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Product is already stocked at this store' });
        }

        const result = await pool.query(
            `INSERT INTO inventory (store_id, product_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING product_id as "productId", quantity, last_updated as "lastUpdated"`,
            [storeId, pid, qty]
        );

        res.status(201).json({
            storeId,
            productId: result.rows[0].productId,
            productName: productCheck.rows[0].name,
            quantity: result.rows[0].quantity,
            lastUpdated: result.rows[0].lastUpdated,
        });
    } catch (error) {
        console.error('Error adding product to store:', error);
        res.status(500).json({ error: 'Failed to add product to store' });
    }
});

// DELETE /api/stores/:storeId/inventory/:productId — Remove product from store
app.delete('/api/stores/:storeId/inventory/:productId', verifyToken, async (req, res) => {
    try {
        const storeId = parseInt(req.params.storeId);
        const productId = parseInt(req.params.productId);

        if (isNaN(storeId) || isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid store ID or product ID' });
        }

        const result = await pool.query(
            'DELETE FROM inventory WHERE store_id = $1 AND product_id = $2 RETURNING product_id',
            [storeId, productId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found in this store\'s inventory' });
        }

        res.json({ message: 'Product removed from store inventory', storeId, productId });
    } catch (error) {
        console.error('Error removing product from store:', error);
        res.status(500).json({ error: 'Failed to remove product from store' });
    }
});

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Internal employee website running on port ${PORT}`);
});
