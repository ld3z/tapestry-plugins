// Hanime Connector for Tapestry
// NOTE: Using Regex because Tapestry environment lacks DOM parsing (querySelector, etc.)

const HANIME_BASE_URL = "https://hanime.tv";

function load() {
	console.log("Hanime Plugin: load() function called.");
	const targetUrl = HANIME_BASE_URL; 

	try {
		console.log("Hanime Plugin: Attempting sendRequest to " + targetUrl);
		sendRequest(targetUrl)
		.then((htmlText) => {
			console.log("Hanime Plugin: sendRequest succeeded.");
			// --- THIS IS THE CRUCIAL LOG ---
			console.log("Hanime Plugin: Response start (first 500 chars): " + htmlText?.substring(0, 500)); 
			// --- END CRUCIAL LOG ---

			// Now try the regex on the received text
			const videoItemRegex = /<a[^>]*?class="[^"]*?no-touch[^"]*?"[^>]*?href="([^"]*)"[^>]*?>.*?<img[^>]*?class="[^"]*?hv-thumbnail[^"]*?"[^>]*?src="([^"]*)"[^>]*?>.*?<div[^>]*?class="[^"]*?hv-title[^"]*?"[^>]*?>(.*?)<\/div>.*?<\/a>/gis;
			const results = [];
			let match;
			let processedCount = 0;

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
						console.log(`Skipping item match ${processedCount}: Missing data.`);
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
				console.log("Hanime Plugin: No matches found by regex in the received response.");
			} else {
				console.log(`Hanime Plugin: Processed ${results.length} items from ${processedCount} regex matches.`);
			}
			processResults(results);

		})
		.catch((requestError) => {
			console.error("Hanime Plugin: sendRequest failed: " + requestError?.message);
			processError(requestError); 
		});
		console.log("Hanime Plugin: sendRequest promise initiated.");
	} catch (e) {
		console.error("Hanime Plugin: Error within load() function before promise: " + e?.message);
		processError(new Error("Hanime Plugin: Sync error in load(): " + e?.message));
	}
}

// Add initial logs to ensure script loads
console.log("Hanime Plugin: Script loaded.");
console.log("Hanime Plugin: Script finished parsing."); 