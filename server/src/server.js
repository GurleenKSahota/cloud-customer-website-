const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());

// Load products data
const productsPath = path.join(__dirname, '../data/products.json');
let products = [];
try {
	const data = fs.readFileSync(productsPath, 'utf8');
	products = JSON.parse(data);
} catch (err) {
	console.error('Failed to load products.json:', err);
	process.exit(1);
}

// Helper: build category tree
function buildCategoryTree(products) {
	const tree = {};
	products.forEach(p => {
		const { primaryCategory, secondaryCategory, tertiaryCategory } = p;
		if (!primaryCategory) return;
		if (!tree[primaryCategory]) tree[primaryCategory] = {};
		if (secondaryCategory) {
			if (!tree[primaryCategory][secondaryCategory]) tree[primaryCategory][secondaryCategory] = {};
			if (tertiaryCategory) {
				tree[primaryCategory][secondaryCategory][tertiaryCategory] = true;
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
app.get('/categories', (req, res) => {
	const categories = buildCategoryTree(products);
	res.json(categories);
});

// GET /products (with optional filters)
app.get('/products', (req, res) => {
	const { primary, secondary, tertiary } = req.query;
	let filtered = products;
	if (primary) {
  const values = primary.split(',');
  filtered = filtered.filter(p => values.includes(p.primaryCategory));
}
if (secondary) {
  const values = secondary.split(',');
  filtered = filtered.filter(p => values.includes(p.secondaryCategory));
}
if (tertiary) {
  const values = tertiary.split(',');
  filtered = filtered.filter(p => values.includes(p.tertiaryCategory));
}
res.json(filtered);
});

// Serve static files from ../../web
const webPath = path.join(__dirname, '../../web');
app.use(express.static(webPath));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
