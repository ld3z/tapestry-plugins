// The base URL for the Comick website (used for constructing links)
const COMICK_WEB_URL = "https://comick.io";
// The base URL for the API is automatically provided as the 'site' variable
// from plugin-config.json
const LANGUAGE_CODE = "en"; // Define language code

// The 'include_nsfw' variable will be injected by Tapestry based on ui-config.json
// It defaults to "off" if not set or if ui-config.json is missing.
// Check if the value is the string "on" for true.
const includeNsfwContent = (typeof include_nsfw === 'string' && include_nsfw === 'on'); // Updated check

function load() {
	// Fetch the latest 40 chapters for the specified language
	// NOTE: Based on assumptions about the Comick API endpoint and parameters
	// Added lang parameter and accept_erotic_content parameter to the endpoint
	// Assuming 'accept_erotic_content=true' includes NSFW, 'false' excludes it.
	const endpoint = `${site}/chapter?order=new&page=1&limit=40&lang=${LANGUAGE_CODE}&accept_erotic_content=${includeNsfwContent}`;

	console.log("Requesting endpoint: " + endpoint); // Log the final endpoint for debugging

	// Get the current time to filter out future-dated chapters
	const now = new Date();

	sendRequest(endpoint)
	.then((text) => {
		let jsonObject;
		try {
			jsonObject = JSON.parse(text);
		} catch (e) {
			processError(new Error("Failed to parse JSON response from Comick API. " + e.message));
			return;
		}

		// Assuming the chapters are directly in the root array
		// Adjust this if the chapters are nested (e.g., jsonObject.data)
		const chapters = jsonObject;

		if (!Array.isArray(chapters)) {
			// Check if the response indicates no chapters found for the language
			if (typeof chapters === 'object' && chapters !== null && Object.keys(chapters).length === 0) {
				console.log(`No chapters found for language: ${LANGUAGE_CODE}`);
				processResults([]); // Process empty results if no chapters found
				return;
			}
			processError(new Error(`Unexpected response format from Comick API for language ${LANGUAGE_CODE}. Expected an array.`));
			return;
		}

		let results = [];
		for (const chapterData of chapters) {
			try {
				// --- Extract Data (with checks for missing fields) ---
				const chapterHid = chapterData.hid;
				const chapterDateStr = chapterData.created_at;
				const chapterNum = chapterData.chap || ""; // Use empty string if null/undefined
				const volumeNum = chapterData.vol || "";
				const chapterTitle = chapterData.title || ""; // Often empty, use number mainly

				const comicInfo = chapterData.md_comics;
				if (!comicInfo || !comicInfo.hid || !comicInfo.slug || !comicInfo.title) {
					console.log("Skipping chapter due to missing comic info: " + chapterHid);
					continue; // Skip if essential comic data is missing
				}

				const comicSlug = comicInfo.slug;
				const comicTitle = comicInfo.title;

				let coverUrl = null;
				if (Array.isArray(comicInfo.md_covers) && comicInfo.md_covers.length > 0 && comicInfo.md_covers[0].b2_url) {
					coverUrl = comicInfo.md_covers[0].b2_url;
				}

				if (!chapterHid || !chapterDateStr) {
					console.log("Skipping chapter due to missing hid or date.");
					continue; // Skip if essential chapter data is missing
				}

				// --- Check Release Date ---
				const date = new Date(chapterDateStr);
				if (date > now) {
					// If the chapter's date is in the future, skip it for now.
					// It will be picked up on a later refresh after it's released.
					console.log(`Skipping future-dated chapter: ${chapterHid} scheduled for ${date.toISOString()}`);
					continue;
				}

				// --- Construct URLs ---
				// Use the LANGUAGE_CODE constant in the chapter URI
				const chapterUri = `${COMICK_WEB_URL}/comic/${comicSlug}/${chapterHid}-chapter-${chapterNum}-${LANGUAGE_CODE}`; // Unique URI for the item
				const comicUri = `${COMICK_WEB_URL}/comic/${comicSlug}`; // Link for the author/series

				// --- Create Tapestry Item ---
				const item = Item.createWithUriDate(chapterUri, date);

				// --- Set Title ---
				let displayTitle = comicTitle;
				if (volumeNum) {
					displayTitle += ` Vol. ${volumeNum}`;
				}
				if (chapterNum) {
					displayTitle += ` Ch. ${chapterNum}`;
				}
				if (chapterTitle) {
					displayTitle += `: ${chapterTitle}`;
				}
				// Add language identifier to title for clarity
				item.title = `${displayTitle} [${LANGUAGE_CODE.toUpperCase()}]`;

				// --- Set Body ---
				// Use the LANGUAGE_CODE constant in the link text
				item.body = `<p>New chapter released: <a href="${chapterUri}">Read ${comicTitle} Chapter ${chapterNum} (${LANGUAGE_CODE.toUpperCase()})</a></p>`;

				// --- Set Author (as the Comic Series) ---
				const author = Identity.createWithName(comicTitle);
				author.uri = comicUri;
				if (coverUrl) {
					author.avatar = coverUrl;
				}
				item.author = author;

				// --- Add to results ---
				results.push(item);

			} catch (e) {
				// Log error for a specific item but continue processing others
				console.log("Error processing chapter item: " + (chapterData.hid || 'Unknown') + " - " + e.message);
			}
		}
		processResults(results);
	})
	.catch((requestError) => {
		// Handle network or API errors
		processError(requestError);
	});
}

// Optional: Implement verify() if needed later
/*
function verify() {
	// Example: Check if the base API is reachable
	sendRequest(site + "/ping") // Assuming a /ping or similar health check endpoint
	.then((text) => {
		// Minimal verification: just check if we got a response
		const verification = {
			displayName: "Comick API (EN)", // Update display name
			// icon: "URL_TO_COMICK_FAVICON", // Optional: Find a favicon URL
			baseUrl: COMICK_WEB_URL // Base for relative links if needed elsewhere
		}
		processVerification(verification);
	})
	.catch((requestError) => {
		processError(requestError);
	});
}
*/ 