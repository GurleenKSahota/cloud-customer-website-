
// Store category data globally for dropdown population
let categoryData = [];

window.addEventListener('DOMContentLoaded', () => {
	fetch('/categories')
		.then(res => res.json())
		.then(categories => {
			categoryData = categories;
			renderCategoryDropdowns(categories);
			// Fetch all products on initial page load
			fetchFilteredProducts();
		})
		.catch(error => {
			console.error('Error fetching categories:', error);
		});
});

function renderCategoryDropdowns(categories) {
	const container = document.getElementById('category-filters');
	container.innerHTML = '';

	// Primary dropdown
	const primaryGroup = document.createElement('div');
	primaryGroup.className = 'dropdown-group';
	const primaryLabel = document.createElement('label');
	primaryLabel.textContent = 'Category';
	primaryLabel.setAttribute('for', 'primary-select');
	const primarySelect = document.createElement('select');
	primarySelect.id = 'primary-select';
	primarySelect.innerHTML = '<option value="">All Categories</option>';
	categories.forEach(cat => {
		const opt = document.createElement('option');
		opt.value = cat.name;
		opt.textContent = cat.name;
		primarySelect.appendChild(opt);
	});
	primarySelect.addEventListener('change', onPrimaryChange);
	primaryGroup.appendChild(primaryLabel);
	primaryGroup.appendChild(primarySelect);
	container.appendChild(primaryGroup);

	// Secondary dropdown
	const secondaryGroup = document.createElement('div');
	secondaryGroup.className = 'dropdown-group';
	const secondaryLabel = document.createElement('label');
	secondaryLabel.textContent = 'Subcategory';
	secondaryLabel.setAttribute('for', 'secondary-select');
	const secondarySelect = document.createElement('select');
	secondarySelect.id = 'secondary-select';
	secondarySelect.innerHTML = '<option value="">All Subcategories</option>';
	secondarySelect.disabled = true;
	secondarySelect.addEventListener('change', onSecondaryChange);
	secondaryGroup.appendChild(secondaryLabel);
	secondaryGroup.appendChild(secondarySelect);
	container.appendChild(secondaryGroup);

	// Tertiary dropdown
	const tertiaryGroup = document.createElement('div');
	tertiaryGroup.className = 'dropdown-group';
	const tertiaryLabel = document.createElement('label');
	tertiaryLabel.textContent = 'Type';
	tertiaryLabel.setAttribute('for', 'tertiary-select');
	const tertiarySelect = document.createElement('select');
	tertiarySelect.id = 'tertiary-select';
	tertiarySelect.innerHTML = '<option value="">All Types</option>';
	tertiarySelect.disabled = true;
	tertiarySelect.addEventListener('change', onTertiaryChange);
	tertiaryGroup.appendChild(tertiaryLabel);
	tertiaryGroup.appendChild(tertiarySelect);
	container.appendChild(tertiaryGroup);
}

function onPrimaryChange() {
	const primarySelect = document.getElementById('primary-select');
	const secondarySelect = document.getElementById('secondary-select');
	const tertiarySelect = document.getElementById('tertiary-select');
	const primaryValue = primarySelect.value;

	// Reset and disable secondary and tertiary
	secondarySelect.innerHTML = '<option value="">All Subcategories</option>';
	tertiarySelect.innerHTML = '<option value="">All Types</option>';
	tertiarySelect.disabled = true;

	if (primaryValue) {
		const primary = categoryData.find(c => c.name === primaryValue);
		if (primary && primary.secondaries && primary.secondaries.length > 0) {
			primary.secondaries.forEach(sec => {
				const opt = document.createElement('option');
				opt.value = sec.name;
				opt.textContent = sec.name;
				secondarySelect.appendChild(opt);
			});
			secondarySelect.disabled = false;
		} else {
			secondarySelect.disabled = true;
		}
	} else {
		secondarySelect.disabled = true;
	}

	fetchFilteredProducts();
}

function onSecondaryChange() {
	const primarySelect = document.getElementById('primary-select');
	const secondarySelect = document.getElementById('secondary-select');
	const tertiarySelect = document.getElementById('tertiary-select');
	const primaryValue = primarySelect.value;
	const secondaryValue = secondarySelect.value;

	// Reset tertiary
	tertiarySelect.innerHTML = '<option value="">All Types</option>';

	if (primaryValue && secondaryValue) {
		const primary = categoryData.find(c => c.name === primaryValue);
		if (primary) {
			const secondary = primary.secondaries.find(s => s.name === secondaryValue);
			if (secondary && secondary.tertiaries && secondary.tertiaries.length > 0) {
				secondary.tertiaries.forEach(ter => {
					const opt = document.createElement('option');
					opt.value = ter.name;
					opt.textContent = ter.name;
					tertiarySelect.appendChild(opt);
				});
				tertiarySelect.disabled = false;
			} else {
				tertiarySelect.disabled = true;
			}
		}
	} else {
		tertiarySelect.disabled = true;
	}

	fetchFilteredProducts();
}

function onTertiaryChange() {
	fetchFilteredProducts();
}

function fetchFilteredProducts() {
	const primarySelect = document.getElementById('primary-select');
	const secondarySelect = document.getElementById('secondary-select');
	const tertiarySelect = document.getElementById('tertiary-select');

	const primary = primarySelect.value;
	const secondary = secondarySelect.value;
	const tertiary = tertiarySelect.value;

	// Build query params - if no primary selected, fetch all products
	const params = new URLSearchParams();
	if (primary) {
		params.append('primary', primary);
		if (secondary) params.append('secondary', secondary);
		if (tertiary) params.append('tertiary', tertiary);
	}

	fetch(`/products${params.toString() ? '?' + params.toString() : ''}`)
		.then(res => res.json())
		.then(products => {
			renderProducts(products);
		})
		.catch(error => {
			console.error('Error fetching products:', error);
		});
}






function renderProducts(products) {
	const list = document.getElementById('product-list');
	list.innerHTML = '';
	if (!products || products.length === 0) {
		list.textContent = 'No products found.';
		return;
	}
	products.forEach(product => {
		const card = document.createElement('div');
		// Name
		const name = document.createElement('h3');
		name.textContent = product.name;
		card.appendChild(name);
		// Barcode
		if (product.barcode) {
			const barcode = document.createElement('p');
			barcode.textContent = `Barcode: ${product.barcode}`;
			card.appendChild(barcode);
		}
		// Image
		if (product.imageUrl) {
			const img = document.createElement('img');
			img.src = product.imageUrl;
			img.alt = product.name;
			card.appendChild(img);
		}
		// Description
		const desc = document.createElement('p');
		desc.textContent = product.description;
		card.appendChild(desc);
		// Ingredients
		if (Array.isArray(product.ingredients) && product.ingredients.length > 0) {
			const ingLabel = document.createElement('strong');
			ingLabel.textContent = 'Ingredients:';
			card.appendChild(ingLabel);
			const ingList = document.createElement('ul');
			product.ingredients.forEach(ing => {
				const li = document.createElement('li');
				li.textContent = ing;
				ingList.appendChild(li);
			});
			card.appendChild(ingList);
		}
		// Price
		const price = document.createElement('p');
		price.textContent = `Price: $${product.price.toFixed(2)}`;
		card.appendChild(price);
		// Category info
		const catInfo = document.createElement('p');
		let catText = `Category: ${product.primaryCategory}`;
		if (product.secondaryCategory) catText += ` > ${product.secondaryCategory}`;
		if (product.tertiaryCategory) catText += ` > ${product.tertiaryCategory}`;
		catInfo.textContent = catText;
		card.appendChild(catInfo);
		// Add card to list
		list.appendChild(card);
	});
}
