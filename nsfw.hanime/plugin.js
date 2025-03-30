// Hanime Connector for Tapestry

const HANIME_BASE_URL = "https://hanime.tv";

function load() {
	console.log("Fetching Hanime homepage...");

	sendRequest(HANIME_BASE_URL)
	.then((htmlText) => {
		// --- Use Regex to find video items ---
		// This regex attempts to find the item container and capture the href, src, and title.
		// It looks for elements with classes containing 'item', 'no-touch', 'hv-thumbnail', and 'hv-title'.
		// NOTE: This regex is based on the selectors in the original code and might need
		// adjustment if the actual Hanime.tv HTML structure is different or changes.
		// It assumes a structure like: <div class="...item..."> ... <a href="..."> ... <img src="..."> ... <div class="hv-title">TITLE</div> ... </div>
		const videoItemRegex = /<div class="[^"]*item[^"]*">.*?<a class="[^"]*no-touch[^"]*" href="([^"]*)".*?<img class="[^"]*hv-thumbnail[^"]*" src="([^"]*)".*?<div class="hv-title.*?>(.*?)<\/div>.*?<\/div>/gis;

		const results = [];
		let match;
		let processedCount = 0;

		// Loop through all matches found in the HTML
		while ((match = videoItemRegex.exec(htmlText)) !== null) {
			processedCount++;
			try {
				// Extract captured groups:
				// match[1]: href attribute value
				// match[2]: src attribute value
				// match[3]: title text content (might include surrounding whitespace or tags, needs cleanup)

				const relativeVideoPath = match[1];
				const coverUrl = match[2];
				// Clean up the title: remove potential HTML tags and trim whitespace
				const title = match[3].replace(/<[^>]*>/g, '').trim();

				if (!relativeVideoPath || !title || !coverUrl) {
					console.log(`Skipping item match ${processedCount}: Missing href, title text, or image src attribute.`);
					continue; // continue to next match
				}

				const videoUri = new URL(relativeVideoPath, HANIME_BASE_URL).href; // Ensure absolute URL

				// --- Create Tapestry Item (without specific date) ---
				// Tapestry will use the fetch time for ordering
				const item = Item.createWithUri(videoUri); // Use createWithUri since we don't have a specific date

				// --- Set Title ---
				item.title = title;

				// --- Set Body ---
				// Include the cover image and a link to the video.
				// Since provides_attachments is likely false (default), Tapestry should show the image.
				item.body = `<p><a href="${videoUri}"><img src="${coverUrl}" alt="${title}" /></a></p><p><a href="${videoUri}">Watch: ${title}</a></p>`;

				// --- Set Author ---
				const author = Identity.createWithName("Hanime");
				author.uri = HANIME_BASE_URL;
				// author.avatar = "URL_TO_HANIME_LOGO_IF_AVAILABLE"; // Optional: Add if you find a good logo URL
				item.author = author;

				results.push(item);

			} catch (e) {
				console.log(`Error processing video item match ${processedCount}: ${e.message}`);
				// Continue processing other items
			}
		} // end while loop

		if (processedCount === 0) {
			console.log("No video items matching the regex pattern found on the page.");
			// It's possible the structure changed or the initial fetch didn't contain the expected carousel.
			// Consider if this should be an error or just an empty result.
			// processError(new Error("Could not find any video items matching the expected pattern."));
			processResults([]); // Sending empty results might be preferable.
			return;
		}

		console.log(`Successfully processed ${results.length} Hanime items out of ${processedCount} potential matches.`);
		processResults(results);

	})
	.catch((requestError) => {
		console.log("Error fetching Hanime.tv: " + requestError.message);
		processError(requestError);
	});
} 