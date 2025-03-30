// Hanime Connector for Tapestry
// NOTE: Using Regex because Tapestry environment lacks DOM parsing (querySelector, etc.)

const HANIME_BASE_URL = "https://hanime.tv";

function load() {
	console.log("Fetching Hanime homepage...");

	sendRequest(HANIME_BASE_URL)
	.then((htmlText) => {
		// --- Use Regex to find video items ---
		// This regex attempts to find the item container and capture the href, src, and title.
		// It looks for elements with classes containing 'item', 'no-touch', 'hv-thumbnail', and 'hv-title'.
		// Based on site inspection (as of late 2023/early 2024), the structure might be different.
		// This regex is kept as a starting point but likely needs adjustment based on actual fetched HTML.
		// Example target structure (might be outdated):
		// <a href="/videos/hentai/..." class="...no-touch...">
		//  <img class="...hv-thumbnail..." src="...">
		//  <div class="hv-title">...TITLE...</div>
		// </a>
		// A more robust regex might target the <a> tag directly if it contains everything.
		const videoItemRegex = /<a[^>]*?class="[^"]*?no-touch[^"]*?"[^>]*?href="([^"]*)"[^>]*?>.*?<img[^>]*?class="[^"]*?hv-thumbnail[^"]*?"[^>]*?src="([^"]*)"[^>]*?>.*?<div[^>]*?class="[^"]*?hv-title[^"]*?"[^>]*?>(.*?)<\/div>.*?<\/a>/gis;


		const results = [];
		let match;
		let processedCount = 0;

		// Loop through all matches found in the HTML
		while ((match = videoItemRegex.exec(htmlText)) !== null) {
			processedCount++;
			try {
				// Extract captured groups:
				// match[1]: href attribute value (relative path)
				// match[2]: src attribute value (thumbnail URL)
				// match[3]: title text content (might include surrounding whitespace or tags, needs cleanup)

				const relativeVideoPath = match[1];
				const coverUrl = match[2];
				// Clean up the title: remove potential HTML tags and trim whitespace
				const title = match[3].replace(/<[^>]*>/g, '').trim();

				if (!relativeVideoPath || !title || !coverUrl) {
					console.log(`Skipping item match ${processedCount}: Missing href, title text, or image src attribute.`);
					continue; // continue to next match
				}

				// Ensure URLs are absolute
				const videoUri = new URL(relativeVideoPath, HANIME_BASE_URL).href;
				// Cover URL might already be absolute, but resolve just in case
				const absoluteCoverUrl = new URL(coverUrl, HANIME_BASE_URL).href;

				// --- Create Tapestry Item (without specific date) ---
				const item = Item.createWithUri(videoUri);

				// --- Set Title ---
				item.title = title;

				// --- Set Body ---
				item.body = `<p><a href="${videoUri}"><img src="${absoluteCoverUrl}" alt="${title}" /></a></p><p><a href="${videoUri}">Watch: ${title}</a></p>`;

				// --- Set Author ---
				const author = Identity.createWithName("Hanime");
				author.uri = HANIME_BASE_URL;
				item.author = author;

				results.push(item);

			} catch (e) {
				console.log(`Error processing video item match ${processedCount}: ${e.message}`);
				// Continue processing other items
			}
		} // end while loop

		if (processedCount === 0) {
			console.log("No video items matching the regex pattern found in the fetched HTML.");
			// This could be due to:
			// 1. Regex pattern mismatch with actual HTML structure.
			// 2. Content being loaded dynamically via JavaScript (not present in initial HTML).
			// 3. Site structure changed significantly.
			processResults([]); // Send empty results
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