// Base URL for constructing web links
const COMICK_WEB_URL = "https://comick.io";
// Base API URL provided by 'site' in plugin-config.json

// --- User Inputs (Injected by Tapestry) ---
const userSlugsRaw = (typeof comic_slugs === 'string') ? comic_slugs : "";
const selectedLanguageCode = (typeof language_code === 'string' && language_code) ? language_code : "en";
const includeNsfwContent = (typeof include_nsfw === 'string' && include_nsfw === 'on');

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
	console.log(`Fetching HID for slug: ${slug} from ${endpoint}`);
	try {
		const text = await sendRequest(endpoint);
		const jsonObject = JSON.parse(text);
		// Adjust path based on actual API response structure
		if (jsonObject && jsonObject.comic && jsonObject.comic.hid) {
			console.log(`Found HID: ${jsonObject.comic.hid} for slug: ${slug}`);
			return jsonObject.comic.hid;
		} else {
			console.log(`Could not find HID in response for slug: ${slug}`);
			return null; // Slug might be invalid or API structure changed
		}
	} catch (error) {
		console.log(`Error fetching HID for slug ${slug}: ${error.message}`);
		// Propagate error or return null? Returning null for now to allow others to proceed.
		// Consider throwing if one failure should stop everything.
		return null;
	}
}

// --- Helper: Fetch Chapters for a Comic HID ---
// Assumes API endpoint: /comic/:hid/chapters?lang=...&limit=...&page=1&order=new
async function fetchChaptersForHid(hid, lang, limit) {
	// API uses hyphenated language codes
	const apiLangCode = lang.replace('_', '-');
	const endpoint = `${site}/comic/${hid}/chapters?lang=${apiLangCode}&limit=${limit}&page=1&order=new&accept_erotic_content=${includeNsfwContent}`;
	console.log(`Fetching chapters for HID: ${hid}, Lang: ${apiLangCode} from ${endpoint}`);
	try {
		const text = await sendRequest(endpoint);
		const jsonObject = JSON.parse(text);
		// Adjust path based on actual API response structure (e.g., jsonObject.chapters)
		if (jsonObject && Array.isArray(jsonObject.chapters)) {
			console.log(`Found ${jsonObject.chapters.length} chapters for HID: ${hid}`);
			// Add the comic's HID back to each chapter object for easier processing later if needed
            // (though the chapter data likely already contains md_comics.hid)
			// jsonObject.chapters.forEach(ch => ch.comic_hid = hid);
			return jsonObject.chapters;
		} else {
			console.log(`Invalid or empty chapter data for HID: ${hid}`);
			return []; // Return empty array if no chapters or bad format
		}
	} catch (error) {
		console.log(`Error fetching chapters for HID ${hid}: ${error.message}`);
		return []; // Return empty on error to allow others to proceed
	}
}

// --- Main Load Function ---
function load() {
	const slugs = parseSlugs(userSlugsRaw);

	if (slugs.length === 0) {
		processError(new Error("No comic slugs provided. Please enter at least one slug in the feed settings."));
		return;
	}

	console.log(`Processing slugs: ${slugs.join(', ')}`);
	const now = new Date(); // For filtering future chapters

	// 1. Fetch HIDs for all slugs concurrently
	Promise.all(slugs.map(slug => fetchComicHid(slug)))
	.then(hids => {
		const validHids = hids.filter(hid => hid !== null);
		if (validHids.length === 0) {
			throw new Error("Could not find valid IDs for any of the provided slugs.");
		}
		console.log(`Found valid HIDs: ${validHids.join(', ')}`);

		// 2. Fetch chapters for all valid HIDs concurrently
		const chapterPromises = validHids.map(hid =>
			fetchChaptersForHid(hid, selectedLanguageCode, MAX_CHAPTERS_PER_COMIC)
		);
		return Promise.all(chapterPromises);
	})
	.then(chaptersArrays => {
		// 3. Combine, sort, and limit chapters
		const allChapters = chaptersArrays.flat(); // Flatten array of arrays

		// Sort by creation date, newest first
		allChapters.sort((a, b) => {
			const dateA = new Date(a.created_at || 0);
			const dateB = new Date(b.created_at || 0);
			return dateB - dateA;
		});

		// Filter out potential future-dated chapters and take the top N overall
		const finalChapters = allChapters
			.filter(chapter => {
				const chapterDate = new Date(chapter.created_at || 0);
				return chapterDate <= now;
			})
			.slice(0, MAX_RESULTS_TOTAL);

		console.log(`Processing ${finalChapters.length} final chapters.`);

		// 4. Process into Tapestry Items
		let results = [];
		for (const chapterData of finalChapters) {
			try {
				// --- Extract Data (similar to fun.comick, add checks) ---
				const chapterHid = chapterData.hid;
				if (!chapterHid) continue; // Skip if chapter HID is missing

				const chapterDateStr = chapterData.created_at;
				const chapterDate = chapterDateStr ? new Date(chapterDateStr) : new Date(0);

				// Use chapter number and volume if available, fallback title
				let displayChapterNum = `Ch. ${chapterData.chap || '?'}`;
				if (chapterData.vol) {
					displayChapterNum = `Vol. ${chapterData.vol} ${displayChapterNum}`;
				}
				const chapterTitle = chapterData.title ? `: ${chapterData.title}` : ""; // Add title if present

				// Comic info should be present in chapter data
				const comicInfo = chapterData.md_comics;
                 if (!comicInfo || !comicInfo.slug || !comicInfo.title) {
                     console.log(`Skipping chapter ${chapterHid} due to missing comic info.`);
                     continue;
                 }
				const comicSlug = comicInfo.slug;
				const comicTitle = comicInfo.title;
				const comicUri = `${COMICK_WEB_URL}/comic/${comicSlug}`;

				// Construct chapter URI
				// Format: https://comick.io/comic/[COMIC-SLUG]/[CHAPTER-HID]-[LANG-CODE]
				// Need to confirm this URI structure is correct
				const chapterUri = `${comicUri}/${chapterHid}-chapter-${chapterData.chap || '0'}-${selectedLanguageCode.replace('_','-')}`; // Use API lang code

				// Cover image (use md_covers if available in chapter data, otherwise fallback needed?)
                // Assuming md_covers is sometimes present directly in chapter data from /comic/:hid/chapters
				const coverInfo = chapterData.md_covers?.[0];
				const coverUrl = coverInfo ? `https://meo.comick.pictures/${coverInfo.b2key}` : (comicInfo.md_covers?.[0] ? `https://meo.comick.pictures/${comicInfo.md_covers[0].b2key}`: null); // Fallback to comic cover?

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
				console.log(`Error processing chapter item: ${chapterData?.hid || 'Unknown'} - ${e.message}`);
			}
		}
		processResults(results);
	})
	.catch(error => {
		// Handle errors from fetching HIDs or chapters
		processError(error);
	});
}

// Optional: Implement verify() if needed for this connector
/*
function verify() {
    // Could potentially verify the base API endpoint
    sendRequest(site + "/ping") // Or another simple endpoint
    .then(text => {
        processVerification({ displayName: "ComicK Custom API" });
    })
    .catch(err => {
        processError(new Error("Failed to reach Comick API: " + err.message));
    });
}
*/ 