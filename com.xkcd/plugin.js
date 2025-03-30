// XKCD Connector for Tapestry

const XKCD_API_LATEST = "https://xkcd.com/info.0.json";
const XKCD_WEB_URL_BASE = "https://xkcd.com";

function load() {
	console.log("Fetching latest XKCD comic...");

	sendRequest(XKCD_API_LATEST)
	.then((text) => {
		let comicData;
		try {
			comicData = JSON.parse(text);
			console.log("Received XKCD data for comic #" + comicData.num);
		} catch (e) {
			processError(new Error("Failed to parse JSON response from XKCD API. " + e.message));
			return;
		}

		// --- Extract Data ---
		const num = comicData.num;
		const title = comicData.title;
		const imgUrl = comicData.img;
		const altText = comicData.alt;
		const year = parseInt(comicData.year, 10);
		const month = parseInt(comicData.month, 10); // API month is 1-based
		const day = parseInt(comicData.day, 10);

		if (!num || !title || !imgUrl || !altText || !year || !month || !day) {
			processError(new Error("Incomplete data received from XKCD API for comic #" + num));
			return;
		}

		// --- Construct URI and Date ---
		const comicUri = `${XKCD_WEB_URL_BASE}/${num}/`;
		// JavaScript Date month is 0-based
		const date = new Date(year, month - 1, day);

		// --- Create Tapestry Item ---
		const item = Item.createWithUriDate(comicUri, date);

		// --- Set Title ---
		// Format: "#2955: Theoretical Computer Science"
		item.title = `#${num}: ${title}`;

		// --- Set Body ---
		// Include the image and the alt text below it.
		// Tapestry will automatically handle the inline image as an attachment preview
		// because provides_attachments is false in plugin-config.json.
		item.body = `<p><a href="${comicUri}"><img src="${imgUrl}" alt="${altText}" /></a></p><p><em>Alt text:</em> ${altText}</p>`;

		// --- Set Author ---
		const author = Identity.createWithName("XKCD");
		author.uri = XKCD_WEB_URL_BASE;
		// You could potentially fetch the site icon here if needed, but the config icon is usually sufficient
		// author.avatar = "https://xkcd.com/s/0b7742.png";
		item.author = author;

		// --- Process Result ---
		// XKCD only provides the latest comic via this endpoint, so we send a single item.
		console.log("Processing XKCD item #" + num);
		processResults([item]);

	})
	.catch((requestError) => {
		console.log("Error fetching XKCD: " + requestError.message);
		processError(requestError);
	});
} 