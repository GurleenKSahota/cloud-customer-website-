window.addEventListener('DOMContentLoaded', () => {
	Promise.all([
		fetch('/categories').then(res => res.json()),
		fetch('/products').then(res => res.json())
	])
		.then(([categories, products]) => {
			console.log('Categories:', categories);
			console.log('Products:', products);
		})
		.catch(error => {
			console.error('Error fetching data:', error);
		});
});
