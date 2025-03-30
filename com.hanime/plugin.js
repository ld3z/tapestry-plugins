// Hanime Connector for Tapestry

const HANIME_BASE_URL = "https://hanime.tv";

function load() {
	console.log("Fetching Hanime homepage...");

	sendRequest(HANIME_BASE_URL)
	.then((htmlText) => {
		let document;
		try {
			document = parseHTML(htmlText);
		} catch (e) {
			processError(new Error("Failed to parse HTML from Hanime.tv: " + e.message));
			return;
		}

		// Find the main carousel container
		const carousel = document.querySelector('.htv-carousel__scrolls');
		if (!carousel) {
			processError(new Error("Could not find the video carousel element (.htv-carousel__scrolls) on the page."));
			return;
		}

		// Find all video items within the carousel
		const videoElements = carousel.querySelectorAll('.item');
		if (!videoElements || videoElements.length === 0) {
			console.log("No video items (.item) found within the carousel.");
			processResults([]); // No items found is not an error
			return;
		}

		console.log(`Found ${videoElements.length} video items in the carousel.`);
		const results = [];

		videoElements.forEach((videoElement, index) => {
			try {
				const linkElement = videoElement.querySelector('a.no-touch');
				const titleElement = videoElement.querySelector('.hv-title');
				const imgElement = videoElement.querySelector('img.hv-thumbnail'); // Corrected selector for image

				if (!linkElement || !titleElement || !imgElement) {
					console.log(`Skipping item ${index + 1}: Missing link, title, or image element.`);
					return; // continue to next iteration
				}

				const videoUri = new URL(linkElement.getAttribute('href'), HANIME_BASE_URL).href; // Ensure absolute URL
				const title = titleElement.textContent.trim();
				const coverUrl = imgElement.getAttribute('src'); // Get src directly

				if (!videoUri || !title || !coverUrl) {
					console.log(`Skipping item ${index + 1}: Missing href, title text, or image src attribute.`);
					return; // continue to next iteration
				}

				// --- Create Tapestry Item (without specific date) ---
				// Tapestry will use the fetch time for ordering
				const item = Item.createWithUri(videoUri);

				// --- Set Title ---
				item.title = title;

				// --- Set Body ---
				// Include the cover image and a link to the video.
				// Since provides_attachments is false, Tapestry should show the image.
				item.body = `<p><a href="${videoUri}"><img src="${coverUrl}" alt="${title}" /></a></p><p><a href="${videoUri}">Watch: ${title}</a></p>`;

				// --- Set Author ---
				const author = Identity.createWithName("Hanime");
				author.uri = HANIME_BASE_URL;
				// author.avatar = "URL_TO_HANIME_LOGO_IF_AVAILABLE"; // Optional: Add if you find a good logo URL
				item.author = author;

				results.push(item);

			} catch (e) {
				console.log(`Error processing video item ${index + 1}: ${e.message}`);
				// Continue processing other items
			}
		});

		console.log(`Successfully processed ${results.length} Hanime items.`);
		processResults(results);

	})
	.catch((requestError) => {
		console.log("Error fetching Hanime.tv: " + requestError.message);
		processError(requestError);
	});
} 