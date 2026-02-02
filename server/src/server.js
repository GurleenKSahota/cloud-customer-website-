const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(
  "/images",
  express.static(path.join(__dirname, "../public/images"))
);

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'customer_website',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
});

async function buildCategoryTree() {
	const result = await pool.query('SELECT DISTINCT primary_category, secondary_category, tertiary_category FROM products');
	const tree = {};
	
	result.rows.forEach(p => {
		const { primary_category, secondary_category, tertiary_category } = p;
		if (!primary_category) return;
		if (!tree[primary_category]) tree[primary_category] = {};
		if (secondary_category) {
			if (!tree[primary_category][secondary_category]) tree[primary_category][secondary_category] = {};
			if (tertiary_category) {
				tree[primary_category][secondary_category][tertiary_category] = true;
			}
		}
	});
	
	// Convert to structured array
	return Object.entries(tree).map(([primary, secondaries]) => ({
		name: primary,
		secondaries: Object.entries(secondaries).map(([secondary, tertiaries]) => ({
			name: secondary,
			tertiaries: Object.keys(tertiaries).map(t => ({ name: t }))
		}))
	}));
}

// GET /categories
app.get('/categories', async (req, res) => {
	try {
		const categories = await buildCategoryTree();
		res.json(categories);
	} catch (error) {
		console.error('Error fetching categories:', error);
		res.status(500).json({ error: 'Failed to fetch categories' });
	}
});

// GET /products (with optional filters and sales info)
app.get('/products', async (req, res) => {
	try {
		const { primary, secondary, tertiary } = req.query;
		
		// Build dynamic WHERE clause
		let whereConditions = [];
		let params = [];
		let paramIndex = 1;
		
		if (primary) {
			const values = primary.split(',');
			whereConditions.push(`p.primary_category = ANY($${paramIndex})`);
			params.push(values);
			paramIndex++;
		}
		if (secondary) {
			const values = secondary.split(',');
			whereConditions.push(`p.secondary_category = ANY($${paramIndex})`);
			params.push(values);
			paramIndex++;
		}
		if (tertiary) {
			const values = tertiary.split(',');
			whereConditions.push(`p.tertiary_category = ANY($${paramIndex})`);
			params.push(values);
			paramIndex++;
		}
		
		const whereClause = whereConditions.length > 0 
			? 'WHERE ' + whereConditions.join(' AND ')
			: '';
		
		// Query products with highest applicable discount
		const query = `
			SELECT 
				p.id,
				p.barcode,
				p.name,
				p.description,
				p.ingredients,
				p.price,
				p.image_url as "imageUrl",
				p.product_line as "productLine",
				p.primary_category as "primaryCategory",
				p.secondary_category as "secondaryCategory",
				p.tertiary_category as "tertiaryCategory",
				COALESCE(MAX(s.discount_percentage), 0) as "discountPercentage"
			FROM products p
			LEFT JOIN sale_products sp ON sp.product_id = p.id
			LEFT JOIN sales s ON (s.id = sp.sale_id OR s.product_line = p.product_line) 
				AND s.is_active = true
			${whereClause}
			GROUP BY p.id, p.barcode, p.name, p.description, p.ingredients, p.price, 
				p.image_url, p.product_line, p.primary_category, p.secondary_category, p.tertiary_category
			ORDER BY p.name
		`;
		
		const result = await pool.query(query, params);
		
		// Calculate sale price if discount applies
		const products = result.rows.map(product => ({
			...product,
			salePrice: product.discountPercentage > 0 
				? (product.price * (1 - product.discountPercentage / 100)).toFixed(2)
				: null
		}));
		
		res.json(products);
	} catch (error) {
		console.error('Error fetching products:', error);
		res.status(500).json({ error: 'Failed to fetch products' });
	}
});

// GET /stores - List all stores
app.get('/stores', async (req, res) => {
	try {
		const result = await pool.query('SELECT id, name, street_address as "streetAddress" FROM stores ORDER BY name');
		res.json(result.rows);
	} catch (error) {
		console.error('Error fetching stores:', error);
		res.status(500).json({ error: 'Failed to fetch stores' });
	}
});

// GET /inventory/:storeId
app.get('/inventory/:storeId', async (req, res) => {
	try {
		const storeId = parseInt(req.params.storeId);
		
		if (isNaN(storeId)) {
			return res.status(400).json({ error: 'Invalid store ID' });
		}
		
		const result = await pool.query(
			`SELECT 
				i.product_id as "productId",
				i.quantity,
				p.barcode,
				p.name
			FROM inventory i
			JOIN products p ON p.id = i.product_id
			WHERE i.store_id = $1`,
			[storeId]
		);
		
		res.json(result.rows);
	} catch (error) {
		console.error('Error fetching inventory:', error);
		res.status(500).json({ error: 'Failed to fetch inventory' });
	}
});

// Serve static files from ../../web
const webPath = path.join(__dirname, '../../web');
app.use(express.static(webPath));

// Start server
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
	console.log(`Server running on http://${HOST}:${PORT}`);
});

