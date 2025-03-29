// Base URL for constructing web links
const COMICK_WEB_URL = "https://comick.io";
// Base API URL provided by 'site' in plugin-config.json
console.log(`[CustomComick] Initializing. Site: ${site}`);

// --- User Inputs (Injected by Tapestry) ---
const userSlugsRaw = (typeof comic_slugs === 'string') ? comic_slugs : "";
const selectedLanguageCode = (typeof language_code === 'string' && language_code) ? language_code : "en";
const includeNsfwContent = (typeof include_nsfw === 'string' && include_nsfw === 'on');
console.log(`[CustomComick] Inputs - Slugs: '${userSlugsRaw}', Lang: ${selectedLanguageCode}, NSFW: ${includeNsfwContent}`);

// --- Constants ---
const MAX_CHAPTERS_PER_COMIC = 10; // How many latest chapters to fetch per comic initially
const MAX_RESULTS_TOTAL = 40; // Max items to show in the feed overall

// --- Helper: Parse Slugs ---
function parseSlugs(rawSlugs) {
	return rawSlugs.split(',')
		.map(slug => slug.trim())
		.filter(slug => slug !== "");
}

// --- Helper: Fetch Comic HID from Slug ---
// Assumes API endpoint: /comic/:slug returns { comic: { hid: "..." } }
async function fetchComicHid(slug) {
	const endpoint = `${site}/comic/${encodeURIComponent(slug)}`;
	console.log(`[CustomComick] Fetching HID for slug: ${slug} from ${endpoint}`);
	try {
		const text = await sendRequest(endpoint);
		// --- Log Raw Response ---
		// console.log(`[CustomComick] Raw response for slug ${slug}: ${text.substring(0, 500)}...`); // Log first 500 chars
		const jsonObject = JSON.parse(text);
		// Adjust path based on actual API response structure
		if (jsonObject && jsonObject.comic && jsonObject.comic.hid) {
			const hid = jsonObject.comic.hid;
			console.log(`[CustomComick] Found HID: ${hid} for slug: ${slug}`);
			return hid;
		} else {
			console.log(`[CustomComick] Could not find HID in response for slug: ${slug}. Response structure might be different.`);
			// console.log(`[CustomComick] Parsed JSON for slug ${slug}:`, JSON.stringify(jsonObject)); // Log full parsed object if needed
			return null; // Slug might be invalid or API structure changed
		}
	} catch (error) {
		console.log(`[CustomComick] Error fetching/parsing HID for slug ${slug}: ${error.message}`);
		return null;
	}
}

// --- Helper: Fetch Chapters for a Comic HID ---
// Assumes API endpoint: /comic/:hid/chapters?lang=...&limit=...&page=1
async function fetchChaptersForHid(hid, lang, limit) {
	// API uses hyphenated language codes
	const apiLangCode = lang.replace('_', '-');
	const endpoint = `${site}/comic/${hid}/chapters?lang=${apiLangCode}&limit=${limit}&page=1`;
	console.log(`[CustomComick] Fetching chapters for HID: ${hid}, Lang: ${apiLangCode} from ${endpoint}`);
	try {
		const text = await sendRequest(endpoint);
        // --- Log Raw Response ---
        // console.log(`[CustomComick] Raw response for chapters HID ${hid}: ${text.substring(0, 500)}...`); // Log first 500 chars
		const jsonObject = JSON.parse(text);
		// Adjust path based on actual API response structure (e.g., jsonObject.chapters)
		if (jsonObject && Array.isArray(jsonObject.chapters)) {
			const chapterCount = jsonObject.chapters.length;
			console.log(`[CustomComick] Found ${chapterCount} chapters in response for HID: ${hid}`);
			return jsonObject.chapters;
		} else {
			console.log(`[CustomComick] Invalid or empty chapter data structure for HID: ${hid}. Expected { chapters: [...] }.`);
            // console.log(`[CustomComick] Parsed JSON for chapters HID ${hid}:`, JSON.stringify(jsonObject)); // Log full parsed object if needed
			return []; // Return empty array if no chapters or bad format
		}
	} catch (error) {
		console.log(`[CustomComick] Error fetching/parsing chapters for HID ${hid}: ${error.message}`);
		return []; // Return empty on error to allow others to proceed
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
	const now = new Date(); // For filtering future chapters
	console.log(`[CustomComick] Current time for filtering: ${now.toISOString()}`);

	// 1. Fetch HIDs for all slugs concurrently
	Promise.all(slugs.map(slug => fetchComicHid(slug)))
	.then(hids => {
		const validHids = hids.filter(hid => hid !== null);
		console.log(`[CustomComick] Fetched HIDs: ${hids.join(', ')}. Valid HIDs: ${validHids.join(', ')}`);
		if (validHids.length === 0) {
			// Throw error if NO valid HIDs were found at all
			throw new Error("Could not find valid comic IDs for any of the provided slugs. Check slugs and API response structure.");
		}
		console.log(`[CustomComick] Fetching chapters for ${validHids.length} valid HIDs.`);
		// 2. Fetch chapters for all valid HIDs concurrently
		const chapterPromises = validHids.map(hid =>
			fetchChaptersForHid(hid, selectedLanguageCode, MAX_CHAPTERS_PER_COMIC)
		);
		return Promise.all(chapterPromises);
	})
	.then(chaptersArrays => {
		// 3. Combine, filter duplicates, sort, and limit chapters
		const allChaptersRaw = chaptersArrays.flat(); // Flatten array of arrays
		console.log(`[CustomComick] Total chapters fetched (before filtering): ${allChaptersRaw.length}`);

		// --- Remove Duplicates based on chapter HID ---
		const seenChapterHids = new Set();
		const uniqueChapters = allChaptersRaw.filter(chapter => {
			if (!chapter || !chapter.hid) {
				// console.log("[CustomComick] Filtering out chapter with missing HID."); // Less verbose log
				return false; // Filter out chapters without an HID
			}
			if (seenChapterHids.has(chapter.hid)) {
				// console.log(`[CustomComick] Filtering out duplicate chapter HID: ${chapter.hid}`); // Less verbose log
				return false; // Already seen this chapter HID
			}
			seenChapterHids.add(chapter.hid);
			return true; // Keep this chapter
		});
		console.log(`[CustomComick] Chapters after duplicate filtering: ${uniqueChapters.length}`);

		// Sort by creation date, newest first
		uniqueChapters.sort((a, b) => {
			const dateA = new Date(a.created_at || 0);
			const dateB = new Date(b.created_at || 0);
			return dateB - dateA; // Newest first
		});

		// Filter out potential future-dated chapters and take the top N overall
		const chaptersBeforeDateFilter = uniqueChapters.length;
		const finalChapters = uniqueChapters
			.filter(chapter => {
				if (!chapter.created_at) return false; // Need a date to compare
				const chapterDate = new Date(chapter.created_at);
				const isFuture = chapterDate > now;
				// if (isFuture) console.log(`[CustomComick] Filtering future chapter ${chapter.hid} (${chapterDate.toISOString()})`); // Log if needed
				return !isFuture;
			})
			.slice(0, MAX_RESULTS_TOTAL);
		console.log(`[CustomComick] Chapters after date filtering (${chaptersBeforeDateFilter} -> ${finalChapters.length}). Sliced to max ${MAX_RESULTS_TOTAL}.`);

		// 4. Process into Tapestry Items
		let results = [];
		console.log(`[CustomComick] Processing ${finalChapters.length} chapters into Tapestry items.`);
		for (const chapterData of finalChapters) {
			try {
				// --- Extract Data (similar to fun.comick, add checks) ---
				const chapterHid = chapterData.hid;
				// Basic check - already filtered non-HID chapters, but good practice
				if (!chapterHid) {
                    console.log("[CustomComick] Skipping item - chapterData missing hid unexpectedly.");
                    continue;
                }

				const chapterDateStr = chapterData.created_at;
				const chapterDate = chapterDateStr ? new Date(chapterDateStr) : new Date(0); // Use epoch if date missing

				// Use chapter number and volume if available, fallback title
				let displayChapterNum = `Ch. ${chapterData.chap || '?'}`;
				if (chapterData.vol) {
					displayChapterNum = `Vol. ${chapterData.vol} ${displayChapterNum}`;
				}
				const chapterTitle = chapterData.title ? `: ${chapterData.title}` : ""; // Add title if present

				// Comic info should be present in chapter data
				const comicInfo = chapterData.md_comics;
                 if (!comicInfo || !comicInfo.slug || !comicInfo.title) {
                     console.log(`[CustomComick] Skipping chapter ${chapterHid} due to missing md_comics info (slug or title).`);
                     continue; // Skip if essential comic data is missing
                 }
				const comicSlug = comicInfo.slug;
				const comicTitle = comicInfo.title;
				const comicUri = `${COMICK_WEB_URL}/comic/${comicSlug}`;

				// Construct chapter URI - Ensure this is unique and correct format
                // Example: https://comick.io/comic/solo-leveling/XnY7z-chapter-1-en
				const apiLangCode = selectedLanguageCode.replace('_','-');
				const chapterUri = `${comicUri}/${chapterHid}-chapter-${chapterData.chap || '0'}-${apiLangCode}`;

				// Cover image
				const coverInfo = chapterData.md_covers?.[0]; // Chapter specific cover?
                const comicCoverInfo = comicInfo.md_covers?.[0]; // Comic cover?
				const coverUrl = coverInfo ? `https://meo.comick.pictures/${coverInfo.b2key}` : (comicCoverInfo ? `https://meo.comick.pictures/${comicCoverInfo.b2key}`: null);

				// --- Create Tapestry Item ---
				const item = Item.createWithUriDate(chapterUri, chapterDate);

				// --- Set Body ---
				item.body = `${displayChapterNum}${chapterTitle}`;
				// Optionally add group info if available: chapterData.group_name?.[0]

				// --- Set Title (Comic Title) ---
				item.title = comicTitle;

				// --- Set Author (as the Comic Series) ---
				const author = Identity.createWithName(comicTitle);
				author.uri = comicUri;
				if (coverUrl) {
					author.avatar = coverUrl;
				}
				item.author = author;

				results.push(item);

			} catch (e) {
				// Log error for a specific item but continue processing others
				console.log(`[CustomComick] Error processing chapter item: ${chapterData?.hid || 'Unknown'} - ${e.message} - Stack: ${e.stack}`);
			}
		}
		console.log(`[CustomComick] Calling processResults with ${results.length} items.`);
		processResults(results); // Pass final array to Tapestry
	})
	.catch(error => {
		// Handle errors from fetching HIDs or chapters or the "No valid IDs" error
		console.log("[CustomComick] Caught error in main promise chain.");
		processError(error); // Report error to Tapestry
	});
}

// Optional: Implement verify() if needed for this connector
/*
function verify() {
    // ...
}
*/ 