// Base URL for constructing web links
const COMICK_WEB_URL = "https://comick.io";
// Base API URL provided by 'site' in plugin-config.json
console.log(`[CustomComick] Initializing. Site: ${site}`);

// --- User Inputs (Injected by Tapestry) ---
const userSlugsRaw = (typeof comic_slugs === 'string') ? comic_slugs : "";
const selectedLanguageCode = (typeof language_code === 'string' && language_code) ? language_code : "en";
console.log(`[CustomComick] Inputs - Slugs: '${userSlugsRaw}', Lang: ${selectedLanguageCode}`);

// --- Constants ---
const MAX_CHAPTERS_PER_COMIC = 10; // How many latest chapters to fetch per comic initially
const MAX_RESULTS_TOTAL = 40; // Max items to show in the feed overall
// Base URL for cover images (adjust if needed)
const COVER_BASE_URL = "https://meo.comick.pictures";

// --- Helper: Parse Slugs ---
function parseSlugs(rawSlugs) {
	return rawSlugs.split(',')
		.map(slug => slug.trim())
		.filter(slug => slug !== "");
}

// --- Helper: Fetch Comic Details (HID, Title, Slug, Cover) from Slug ---
// Calls the /comic/{slug}/ endpoint
// Returns an object: { hid, title, slug, coverUrl } or null on error/not found
async function fetchComicDetails(slug) {
	const endpoint = `${site}/comic/${encodeURIComponent(slug)}`;
	console.log(`[CustomComick] Fetching details for slug: ${slug} from ${endpoint}`);
	try {
		const text = await sendRequest(endpoint);
		const jsonObject = JSON.parse(text);

		// Extract required comic details
		if (jsonObject && jsonObject.comic && jsonObject.comic.hid && jsonObject.comic.title && jsonObject.comic.slug) {
			const hid = jsonObject.comic.hid;
			const title = jsonObject.comic.title;
			const comicSlug = jsonObject.comic.slug; // Use the slug from the response for consistency

			// Extract cover URL
			let coverUrl = null;
			const comicCoverInfo = jsonObject.comic.md_covers?.[0];
			if (comicCoverInfo && comicCoverInfo.b2key) {
				coverUrl = `${COVER_BASE_URL}/${comicCoverInfo.b2key}`;
			}

			console.log(`[CustomComick] Found Details - HID: ${hid}, Title: ${title}, Slug: ${comicSlug}, Cover: ${coverUrl ? 'Yes' : 'No'} for original slug: ${slug}`);
			return { hid, title, slug: comicSlug, coverUrl }; // Return details object
		} else {
			console.log(`[CustomComick] Could not find essential comic details (hid, title, slug) in response for slug: ${slug}.`);
			return null;
		}
	} catch (error) {
		console.log(`[CustomComick] Error fetching/parsing details for slug ${slug}: ${error.message}`);
		return null;
	}
}

// --- Helper: Fetch Chapters for a Comic HID ---
// Calls the /comic/{hid}/chapters endpoint
// Returns the array of chapter objects from the response
async function fetchChaptersForHid(hid, lang, limit) {
	const apiLangCode = lang.replace('_', '-');
	const endpoint = `${site}/comic/${hid}/chapters?lang=${apiLangCode}&limit=${limit}&page=1`;
	console.log(`[CustomComick] Fetching chapters for HID: ${hid}, Lang: ${apiLangCode} from ${endpoint}`);
	try {
		const text = await sendRequest(endpoint);
		const jsonObject = JSON.parse(text);
		// Expects { chapters: [...] } structure based on API docs/previous code
        // If the structure is just the array directly, use: return jsonObject;
		if (jsonObject && Array.isArray(jsonObject.chapters)) {
			const chapterCount = jsonObject.chapters.length;
			console.log(`[CustomComick] Found ${chapterCount} chapters in response for HID: ${hid}`);
			return jsonObject.chapters; // Return the array of chapters
		} else if (Array.isArray(jsonObject)) { // Handle case where response IS the array
            const chapterCount = jsonObject.length;
            console.log(`[CustomComick] Found ${chapterCount} chapters (direct array response) for HID: ${hid}`);
            return jsonObject;
        }
        else {
			console.log(`[CustomComick] Invalid or empty chapter data structure for HID: ${hid}. Expected { chapters: [...] } or direct array.`);
			return []; // Return empty array if no chapters or bad format
		}
	} catch (error) {
		console.log(`[CustomComick] Error fetching/parsing chapters for HID ${hid}: ${error.message}`);
		return []; // Return empty on error
	}
}

// --- Main Load Function ---
function load() {
	console.log("[CustomComick] load() called.");
	const slugs = parseSlugs(userSlugsRaw);

	if (slugs.length === 0) {
		console.log("[CustomComick] No valid slugs found after parsing.");
		processError(new Error("No comic slugs provided. Please enter at least one slug in the feed settings."));
		return;
	}

	console.log(`[CustomComick] Processing ${slugs.length} slugs: ${slugs.join(', ')}`);
	const now = new Date();
	console.log(`[CustomComick] Current time for filtering: ${now.toISOString()}`);

	// 1. Fetch Comic Details for all slugs concurrently
	Promise.all(slugs.map(slug => fetchComicDetails(slug)))
	.then(comicDetailsResults => {
		// Filter out null results (errors or not found)
		const validComicDetailsList = comicDetailsResults.filter(details => details !== null);
		console.log(`[CustomComick] Fetched details for ${validComicDetailsList.length} valid comics.`);

		if (validComicDetailsList.length === 0) {
			throw new Error("Could not find valid comic details for any provided slugs. Check slugs and API response.");
		}

		// 2. Fetch chapters for each valid comic, passing comic details along
		const chapterFetchPromises = validComicDetailsList.map(comicDetails =>
			fetchChaptersForHid(comicDetails.hid, selectedLanguageCode, MAX_CHAPTERS_PER_COMIC)
				.then(chapters => ({ // Return object containing both details and chapters
					comicInfo: comicDetails,
					chapters: chapters
				}))
				.catch(error => { // Catch errors fetching chapters for *one* comic
					console.log(`[CustomComick] Error fetching chapters for HID ${comicDetails.hid} (Slug: ${comicDetails.slug}): ${error.message}`);
					return { comicInfo: comicDetails, chapters: [] }; // Return empty chapters for this comic
				})
		);
		return Promise.all(chapterFetchPromises);
	})
	.then(resultsPerComic => {
		// resultsPerComic is an array: [{ comicInfo: {...}, chapters: [...] }, ...]

		// 3. Combine chapters from all comics, filter, sort, limit
		let allChaptersWithInfo = [];
		resultsPerComic.forEach(result => {
			result.chapters.forEach(chapter => {
				// Add comicInfo to each chapter object for easier processing
				allChaptersWithInfo.push({ ...chapter, comicInfo: result.comicInfo });
			});
		});
		console.log(`[CustomComick] Total chapters fetched (before filtering): ${allChaptersWithInfo.length}`);

		// --- Remove Duplicates based on chapter HID ---
		const seenChapterHids = new Set();
		const uniqueChapters = allChaptersWithInfo.filter(chapter => {
			if (!chapter || !chapter.hid) return false;
			if (seenChapterHids.has(chapter.hid)) return false;
			seenChapterHids.add(chapter.hid);
			return true;
		});
		console.log(`[CustomComick] Chapters after duplicate filtering: ${uniqueChapters.length}`);

		// Sort by creation date, newest first
		uniqueChapters.sort((a, b) => {
			const dateA = new Date(a.created_at || 0);
			const dateB = new Date(b.created_at || 0);
			return dateB - dateA;
		});

		// Filter out future-dated chapters and limit total
		const chaptersBeforeDateFilter = uniqueChapters.length;
		const finalChapters = uniqueChapters
			.filter(chapter => {
				if (!chapter.created_at) return false;
				const chapterDate = new Date(chapter.created_at);
				return chapterDate <= now; // Keep only chapters not in the future
			})
			.slice(0, MAX_RESULTS_TOTAL);
		console.log(`[CustomComick] Chapters after date filtering (${chaptersBeforeDateFilter} -> ${finalChapters.length}). Sliced to max ${MAX_RESULTS_TOTAL}.`);

		// 4. Process into Tapestry Items
		let tapestryItems = [];
		console.log(`[CustomComick] Processing ${finalChapters.length} chapters into Tapestry items.`);
		for (const chapterData of finalChapters) {
			try {
				// --- Extract Data ---
				const chapterHid = chapterData.hid;
				if (!chapterHid) {
                    console.log("[CustomComick] Skipping item - chapterData missing hid unexpectedly.");
                    continue;
                }
                // Use the comicInfo attached earlier
                const comicInfo = chapterData.comicInfo;
                 if (!comicInfo || !comicInfo.slug || !comicInfo.title) {
                     // This shouldn't happen if filtering worked, but good safety check
                     console.log(`[CustomComick] Skipping chapter ${chapterHid} due to missing associated comicInfo.`);
                     continue;
                 }

				const chapterDateStr = chapterData.created_at;
				const chapterDate = chapterDateStr ? new Date(chapterDateStr) : new Date(0);

				let displayChapterNum = `Ch. ${chapterData.chap || '?'}`;
				if (chapterData.vol) {
					displayChapterNum = `Vol. ${chapterData.vol} ${displayChapterNum}`;
				}
				const chapterTitle = chapterData.title ? `: ${chapterData.title}` : "";

				// Use comic info from the stored comicInfo object
				const comicSlug = comicInfo.slug;
				const comicTitle = comicInfo.title;
				const comicUri = `${COMICK_WEB_URL}/comic/${comicSlug}`;
                const comicCoverUrl = comicInfo.coverUrl; // Use stored cover URL

				// Construct chapter URI
				const apiLangCode = selectedLanguageCode.replace('_','-');
				const chapterUri = `${comicUri}/${chapterHid}-chapter-${chapterData.chap || '0'}-${apiLangCode}`;

				// --- Create Tapestry Item ---
				const item = Item.createWithUriDate(chapterUri, chapterDate);
				item.body = `${displayChapterNum}${chapterTitle}`;
				// Optionally add group info:
                // if (Array.isArray(chapterData.group_name) && chapterData.group_name.length > 0) {
                //     item.body += `\nGroup: ${chapterData.group_name.join(', ')}`;
                // }

				// --- Set Title (Comic Title) ---
				item.title = comicTitle;

				// --- Set Author (as the Comic Series) ---
				const author = Identity.createWithName(comicTitle);
				author.uri = comicUri;
				if (comicCoverUrl) { // Use the cover URL fetched with comic details
					author.avatar = comicCoverUrl;
				}
				item.author = author;

				tapestryItems.push(item);

			} catch (e) {
				console.log(`[CustomComick] Error processing chapter item: ${chapterData?.hid || 'Unknown'} - ${e.message} - Stack: ${e.stack}`);
			}
		}
		console.log(`[CustomComick] Calling processResults with ${tapestryItems.length} items.`);
		processResults(tapestryItems);
	})
	.catch(error => {
		// Handle errors from fetching comic details or the main promise chain
		console.log("[CustomComick] Caught error in main promise chain.");
		processError(error);
	});
}

// Optional: Implement verify() if needed
/*
function verify() {
    // ...
}
*/ 