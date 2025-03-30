// XKCD Connector for Tapestry

const XKCD_API_LATEST = "https://xkcd.com/info.0.json";
const XKCD_API_SPECIFIC = (num) => `https://xkcd.com/${num}/info.0.json`; // Function to generate specific comic URL
const XKCD_WEB_URL_BASE = "https://xkcd.com";
const NUM_COMICS_TO_FETCH = 10; // How many latest comics to fetch

// Helper function to create an Item from comic data
function createTapestryItem(comicData) {
	// --- Extract Data ---
	const num = comicData.num;
	const title = comicData.title;
	const imgUrl = comicData.img;
	const altText = comicData.alt;
	const year = parseInt(comicData.year, 10);
	const month = parseInt(comicData.month, 10); // API month is 1-based
	const day = parseInt(comicData.day, 10);

	if (!num || !title || !imgUrl || !altText || !year || !month || !day) {
		console.log(`Incomplete data received from XKCD API for comic #${num || 'unknown'}. Skipping.`);
		return null; // Skip if data is incomplete
	}

	// --- Construct URI and Date ---
	const comicUri = `${XKCD_WEB_URL_BASE}/${num}/`;
	// JavaScript Date month is 0-based
	const date = new Date(year, month - 1, day);

	// --- Create Tapestry Item ---
	const item = Item.createWithUriDate(comicUri, date);

	// --- Set Title ---
	item.title = `#${num}: ${title}`;

	// --- Set Body ---
	item.body = `<p><a href="${comicUri}"><img src="${imgUrl}" alt="${altText}" /></a></p><p><em>Alt text:</em> ${altText}</p>`;

	// --- Set Author ---
	const author = Identity.createWithName("XKCD");
	author.uri = XKCD_WEB_URL_BASE;
	item.author = author;

	return item;
}


function load() {
	console.log(`Fetching latest ${NUM_COMICS_TO_FETCH} XKCD comics...`);

	// 1. Fetch the latest comic to get its number
	sendRequest(XKCD_API_LATEST)
	.then((latestText) => {
		let latestComicData;
		try {
			latestComicData = JSON.parse(latestText);
		} catch (e) {
			throw new Error("Failed to parse JSON for latest XKCD comic: " + e.message);
		}

		const latestNum = latestComicData.num;
		if (!latestNum) {
			throw new Error("Could not determine the latest XKCD comic number.");
		}
		console.log(`Latest XKCD comic is #${latestNum}. Fetching comics down to #${latestNum - NUM_COMICS_TO_FETCH + 1}.`);

		// 2. Create an array of promises to fetch the desired range of comics
		const comicPromises = [];
		for (let i = 0; i < NUM_COMICS_TO_FETCH; i++) {
			const comicNumToFetch = latestNum - i;
			if (comicNumToFetch <= 0) break; // Stop if we go below comic #1

			// Skip comic 404 as it famously doesn't exist
			if (comicNumToFetch === 404) {
				console.log("Skipping known non-existent comic #404.");
				continue;
			}

			const url = XKCD_API_SPECIFIC(comicNumToFetch);
			console.log(`Adding fetch request for: ${url}`);
			comicPromises.push(sendRequest(url).then(text => ({ num: comicNumToFetch, text: text })).catch(err => ({ num: comicNumToFetch, error: err })));
		}

		// 3. Fetch all comics concurrently and wait for all results (success or failure)
		return Promise.allSettled(comicPromises);

	})
	.then((results) => {
		// 4. Process the results
		const tapestryItems = [];
		console.log(`Processing ${results.length} fetch results.`);

		results.forEach(result => {
			if (result.status === 'fulfilled') {
				const comicResponse = result.value;
				if (comicResponse.error) {
					// Handle errors caught within the individual promise (e.g., network error for one comic)
					console.log(`Failed to fetch XKCD comic #${comicResponse.num}: ${comicResponse.error.message}`);
				} else {
					try {
						const comicData = JSON.parse(comicResponse.text);
						const item = createTapestryItem(comicData);
						if (item) {
							tapestryItems.push(item);
						}
					} catch (e) {
						console.log(`Failed to parse JSON for XKCD comic #${comicResponse.num}: ${e.message}`);
					}
				}
			} else {
				// Handle promises rejected by Promise.allSettled (less likely with the catch inside push)
				console.log(`Fetch promise rejected: ${result.reason}`);
			}
		});

		// 5. Sort items by comic number (descending - latest first)
		tapestryItems.sort((a, b) => {
			// Extract number from title like "#2955: Title"
			const numA = parseInt(a.title.substring(1), 10);
			const numB = parseInt(b.title.substring(1), 10);
			return numB - numA; // Descending order
		});

		console.log(`Successfully processed ${tapestryItems.length} XKCD comics into Tapestry items.`);
		processResults(tapestryItems);

	})
	.catch((error) => {
		// Catch errors from the initial fetch or other unhandled issues
		console.log("Error in XKCD load function: " + error.message);
		processError(error);
	});
} 