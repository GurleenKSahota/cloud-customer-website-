
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
	// Placeholder for future filter logic
	console.log('Category checkbox changed:', {
		value: event.target.value,
		checked: event.target.checked,
		primary: event.target.dataset.primary,
		secondary: event.target.dataset.secondary
	});
}
