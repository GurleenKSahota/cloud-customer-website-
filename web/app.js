
window.addEventListener('DOMContentLoaded', () => {
	fetch('/categories')
		.then(res => res.json())
		.then(categories => {
			renderCategoryCheckboxes(categories);
		})
		.catch(error => {
			console.error('Error fetching categories:', error);
		});
});

function renderCategoryCheckboxes(categories) {
	const container = document.getElementById('category-filters');
	container.innerHTML = '';
	categories.forEach(primary => {
		// Primary category checkbox
		const primaryId = `primary-${encodeURIComponent(primary.name)}`;
		const primaryLabel = document.createElement('label');
		const primaryCheckbox = document.createElement('input');
		primaryCheckbox.type = 'checkbox';
		primaryCheckbox.value = primary.name;
		primaryCheckbox.id = primaryId;
		primaryCheckbox.addEventListener('change', onCategoryCheckboxChange);
		primaryLabel.appendChild(primaryCheckbox);
		primaryLabel.appendChild(document.createTextNode(` ${primary.name}`));
		container.appendChild(primaryLabel);
		container.appendChild(document.createElement('br'));

		// Secondary categories
		if (primary.secondaries && primary.secondaries.length > 0) {
			primary.secondaries.forEach(secondary => {
				const secondaryId = `secondary-${encodeURIComponent(primary.name)}-${encodeURIComponent(secondary.name)}`;
				const secondaryLabel = document.createElement('label');
				const secondaryCheckbox = document.createElement('input');
				secondaryCheckbox.type = 'checkbox';
				secondaryCheckbox.value = secondary.name;
				secondaryCheckbox.id = secondaryId;
				secondaryCheckbox.dataset.primary = primary.name;
				secondaryCheckbox.addEventListener('change', onCategoryCheckboxChange);
				secondaryLabel.style.marginLeft = '1.5em';
				secondaryLabel.appendChild(secondaryCheckbox);
				secondaryLabel.appendChild(document.createTextNode(` ${secondary.name}`));
				container.appendChild(secondaryLabel);
				container.appendChild(document.createElement('br'));

				// Tertiary categories
				if (secondary.tertiaries && secondary.tertiaries.length > 0) {
					secondary.tertiaries.forEach(tertiary => {
						const tertiaryId = `tertiary-${encodeURIComponent(primary.name)}-${encodeURIComponent(secondary.name)}-${encodeURIComponent(tertiary.name)}`;
						const tertiaryLabel = document.createElement('label');
						const tertiaryCheckbox = document.createElement('input');
						tertiaryCheckbox.type = 'checkbox';
						tertiaryCheckbox.value = tertiary.name;
						tertiaryCheckbox.id = tertiaryId;
						tertiaryCheckbox.dataset.primary = primary.name;
						tertiaryCheckbox.dataset.secondary = secondary.name;
						tertiaryCheckbox.addEventListener('change', onCategoryCheckboxChange);
						tertiaryLabel.style.marginLeft = '3em';
						tertiaryLabel.appendChild(tertiaryCheckbox);
						tertiaryLabel.appendChild(document.createTextNode(` ${tertiary.name}`));
						container.appendChild(tertiaryLabel);
						container.appendChild(document.createElement('br'));
					});
				}
			});
		}
	});
}



function onCategoryCheckboxChange(event) {
	// Collect checked checkboxes for each category level (supporting multiple selections)
	const checkboxes = document.querySelectorAll('#category-filters input[type="checkbox"]:checked');
	if (checkboxes.length === 0) {
		const list = document.getElementById('product-list');
		list.innerHTML = '';
		return;
	}
	const primary = [];
	const secondary = [];
	const tertiary = [];
	checkboxes.forEach(cb => {
		if (cb.dataset.secondary) {
			// tertiary
			tertiary.push(cb.value);
			secondary.push(cb.dataset.secondary);
			primary.push(cb.dataset.primary);
		} else if (cb.dataset.primary) {
			// secondary
			secondary.push(cb.value);
			primary.push(cb.dataset.primary);
		} else {
			// primary
			primary.push(cb.value);
		}
	});

	// Remove duplicates
	const unique = arr => Array.from(new Set(arr));
	const params = new URLSearchParams();
	if (primary.length) params.append('primary', unique(primary).join(','));
	if (secondary.length) params.append('secondary', unique(secondary).join(','));
	if (tertiary.length) params.append('tertiary', unique(tertiary).join(','));

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
		// Image
		if (product.imageUrl) {
			const img = document.createElement('img');
			img.src = product.imageUrl;
			img.alt = product.name;
			img.style.maxWidth = '120px';
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
