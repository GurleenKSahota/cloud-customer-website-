const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const cron = require('node-cron');

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

// GET /api/categories — List distinct product categories
app.get('/api/categories', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT DISTINCT primary_category as "category" FROM products WHERE primary_category IS NOT NULL ORDER BY primary_category'
        );
        res.json(result.rows.map(r => r.category));
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
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

// ============================================================
// Report Scheduling API
// ============================================================

// POST /api/schedules — Create a new report schedule
app.post('/api/schedules', verifyToken, async (req, res) => {
    try {
        const { lookbackWindow, frequency, filterType, filterValue } = req.body;

        if (!lookbackWindow || !frequency) {
            return res.status(400).json({ error: 'lookbackWindow and frequency are required' });
        }

        const validLookbacks = ['hour', 'day', 'week'];
        const validFrequencies = ['minute', 'hour', 'day'];

        if (!validLookbacks.includes(lookbackWindow)) {
            return res.status(400).json({ error: `lookbackWindow must be one of: ${validLookbacks.join(', ')}` });
        }
        if (!validFrequencies.includes(frequency)) {
            return res.status(400).json({ error: `frequency must be one of: ${validFrequencies.join(', ')}` });
        }

        if (filterType && !['store', 'category'].includes(filterType)) {
            return res.status(400).json({ error: 'filterType must be "store" or "category"' });
        }

        if (filterType && !filterValue) {
            return res.status(400).json({ error: 'filterValue is required when filterType is specified' });
        }

        const result = await pool.query(
            `INSERT INTO report_schedules (lookback_window, frequency, filter_type, filter_value)
             VALUES ($1, $2, $3, $4)
             RETURNING id, lookback_window as "lookbackWindow", frequency, filter_type as "filterType",
                       filter_value as "filterValue", is_active as "isActive", created_at as "createdAt"`,
            [lookbackWindow, frequency, filterType || null, filterValue || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).json({ error: 'Failed to create schedule' });
    }
});

// GET /api/schedules — List all schedules
app.get('/api/schedules', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.id, s.lookback_window as "lookbackWindow", s.frequency,
                    s.filter_type as "filterType", s.filter_value as "filterValue",
                    s.is_active as "isActive", s.created_at as "createdAt",
                    s.last_run_at as "lastRunAt",
                    (SELECT COUNT(*) FROM generated_reports gr WHERE gr.schedule_id = s.id) as "reportCount"
             FROM report_schedules s
             ORDER BY s.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({ error: 'Failed to fetch schedules' });
    }
});

// DELETE /api/schedules/:id — Delete a schedule and its reports
app.delete('/api/schedules/:id', verifyToken, async (req, res) => {
    try {
        const scheduleId = parseInt(req.params.id);
        if (isNaN(scheduleId)) {
            return res.status(400).json({ error: 'Invalid schedule ID' });
        }

        const result = await pool.query(
            'DELETE FROM report_schedules WHERE id = $1 RETURNING id',
            [scheduleId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        res.json({ message: 'Schedule and its reports deleted', scheduleId });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

// GET /api/schedules/:id/reports — List reports for a schedule
app.get('/api/schedules/:id/reports', verifyToken, async (req, res) => {
    try {
        const scheduleId = parseInt(req.params.id);
        if (isNaN(scheduleId)) {
            return res.status(400).json({ error: 'Invalid schedule ID' });
        }

        const result = await pool.query(
            `SELECT id, schedule_id as "scheduleId",
                    report_start as "reportStart", report_end as "reportEnd",
                    generated_at as "generatedAt",
                    length(csv_content) as "csvSize"
             FROM generated_reports
             WHERE schedule_id = $1
             ORDER BY generated_at DESC
             LIMIT 50`,
            [scheduleId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// GET /api/reports/:id/download — Download a report as CSV
app.get('/api/reports/:id/download', verifyToken, async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        if (isNaN(reportId)) {
            return res.status(400).json({ error: 'Invalid report ID' });
        }

        const result = await pool.query(
            `SELECT csv_content, report_start, report_end, generated_at
             FROM generated_reports WHERE id = $1`,
            [reportId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = result.rows[0];
        const filename = `report_${reportId}_${report.generated_at.toISOString().slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(report.csv_content);
    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).json({ error: 'Failed to download report' });
    }
});

// ============================================================
// Report Generation Logic
// ============================================================

function getLookbackInterval(lookbackWindow) {
    switch (lookbackWindow) {
        case 'hour': return '1 hour';
        case 'day': return '1 day';
        case 'week': return '7 days';
        default: return '1 hour';
    }
}

function getFrequencyMinutes(frequency) {
    switch (frequency) {
        case 'minute': return 1;
        case 'hour': return 60;
        case 'day': return 1440;
        default: return 60;
    }
}

async function generateReport(schedule) {
    const now = new Date();
    const interval = getLookbackInterval(schedule.lookback_window);

    let query;
    let params;

    if (schedule.filter_type === 'store') {
        query = `
            SELECT p.barcode, p.name,
                   COALESCE(SUM(dl.quantity), 0)::integer AS total_quantity_deducted,
                   COALESCE(SUM(dl.quantity * dl.unit_price), 0)::numeric(10,2) AS total_revenue
            FROM deduction_log dl
            JOIN products p ON p.id = dl.product_id
            WHERE dl.deducted_at BETWEEN (NOW() - $1::interval) AND NOW()
              AND dl.store_id = $2
            GROUP BY p.barcode, p.name
            HAVING SUM(dl.quantity) > 0
            ORDER BY p.name`;
        params = [interval, parseInt(schedule.filter_value)];
    } else if (schedule.filter_type === 'category') {
        query = `
            SELECT p.barcode, p.name,
                   COALESCE(SUM(dl.quantity), 0)::integer AS total_quantity_deducted,
                   COALESCE(SUM(dl.quantity * dl.unit_price), 0)::numeric(10,2) AS total_revenue
            FROM deduction_log dl
            JOIN products p ON p.id = dl.product_id
            WHERE dl.deducted_at BETWEEN (NOW() - $1::interval) AND NOW()
              AND p.primary_category = $2
            GROUP BY p.barcode, p.name
            HAVING SUM(dl.quantity) > 0
            ORDER BY p.name`;
        params = [interval, schedule.filter_value];
    } else {
        query = `
            SELECT p.barcode, p.name,
                   COALESCE(SUM(dl.quantity), 0)::integer AS total_quantity_deducted,
                   COALESCE(SUM(dl.quantity * dl.unit_price), 0)::numeric(10,2) AS total_revenue
            FROM deduction_log dl
            JOIN products p ON p.id = dl.product_id
            WHERE dl.deducted_at BETWEEN (NOW() - $1::interval) AND NOW()
            GROUP BY p.barcode, p.name
            HAVING SUM(dl.quantity) > 0
            ORDER BY p.name`;
        params = [interval];
    }

    const result = await pool.query(query, params);

    // Build CSV content
    let csv = 'barcode,name,total_quantity_deducted,total_revenue\n';
    for (const row of result.rows) {
        // Escape name field (may contain commas)
        const escapedName = row.name.includes(',') ? `"${row.name}"` : row.name;
        csv += `${row.barcode},${escapedName},${row.total_quantity_deducted},${row.total_revenue}\n`;
    }

    // Calculate report window timestamps
    const reportEnd = now;
    const reportStart = new Date(now.getTime());
    switch (schedule.lookback_window) {
        case 'hour': reportStart.setHours(reportStart.getHours() - 1); break;
        case 'day': reportStart.setDate(reportStart.getDate() - 1); break;
        case 'week': reportStart.setDate(reportStart.getDate() - 7); break;
    }

    // Save report
    await pool.query(
        `INSERT INTO generated_reports (schedule_id, csv_content, report_start, report_end)
         VALUES ($1, $2, $3, $4)`,
        [schedule.id, csv, reportStart, reportEnd]
    );

    // Update last_run_at
    await pool.query(
        'UPDATE report_schedules SET last_run_at = NOW() WHERE id = $1',
        [schedule.id]
    );

    console.log(`[Report] Generated report for schedule ${schedule.id} (${result.rows.length} products)`);
}

async function checkAndGenerateReports() {
    try {
        const schedules = await pool.query(
            'SELECT * FROM report_schedules WHERE is_active = true'
        );

        const now = new Date();

        for (const schedule of schedules.rows) {
            const freqMinutes = getFrequencyMinutes(schedule.frequency);

            // Check if it's time to generate
            if (schedule.last_run_at) {
                const lastRun = new Date(schedule.last_run_at);
                const elapsedMinutes = (now - lastRun) / (1000 * 60);
                if (elapsedMinutes < freqMinutes) {
                    continue; // Not time yet
                }
            }

            // Generate the report
            try {
                await generateReport(schedule);
            } catch (err) {
                console.error(`[Report] Error generating report for schedule ${schedule.id}:`, err);
            }
        }
    } catch (err) {
        console.error('[Report] Error checking schedules:', err);
    }
}

// --- Schedule the report checker to run every minute ---
cron.schedule('* * * * *', () => {
    checkAndGenerateReports();
});

// Run once at startup to catch any overdue reports
setTimeout(() => checkAndGenerateReports(), 5000);

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
