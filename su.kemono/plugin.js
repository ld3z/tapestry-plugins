// Global variables provided by Tapestry based on ui-config.json
// let site = "https://kemono.su";
// let service = "patreon"; // Default or user-set value
// let creator_id = ""; // User-set value

// --- Helper Function to build API URL ---
function getApiUrl() {
    if (!service || !creator_id) {
        throw new Error("Service and Creator ID must be configured.");
    }
    // *** IMPORTANT ASSUMPTION ***
    // Assuming a hypothetical API endpoint. Real-world scraping is needed.
    // Example: https://kemono.su/api/v1/posts?service=patreon&creator_id=12345
    // Adjust the limit as needed, Kemono pages often show 50.
    return `${site}/api/v1/posts?service=${encodeURIComponent(service)}&creator_id=${encodeURIComponent(creator_id)}&limit=25`;
}

// --- Helper Function to build Web URL ---
function getCreatorUrl() {
     if (!service || !creator_id) {
        return site; // Fallback
    }
    return `${site}/${service}/user/${creator_id}`;
}


// --- Verification Action ---
// Optional: Check if the creator page exists before saving the feed.
// This would ideally hit a creator info endpoint, or just try fetching posts.
function verify() {
    try {
        const apiUrl = getApiUrl(); // Use the posts endpoint for verification for simplicity
        const creatorUrl = getCreatorUrl();

        sendRequest(apiUrl)
        .then((text) => {
            // Attempt to parse to ensure it's valid JSON, even if empty
            const jsonResponse = JSON.parse(text);

            // If the request succeeds, assume the creator exists.
            // A real API might provide creator name/icon here.
            // We'll construct a basic verification object.
            const verification = {
                // Try to create a display name, fallback if needed
                displayName: `Kemono: ${service}/${creator_id}`,
                // We don't have an icon URL from this hypothetical endpoint
                icon: null,
                // Set baseUrl for resolving potential relative paths if needed
                baseUrl: site
            };
            processVerification(verification);
        })
        .catch((requestError) => {
             // If the request fails (e.g., 404), the creator might not exist
             console.error("Kemono verification error: " + requestError);
             processError(new Error(`Failed to verify creator ${service}/${creator_id}. Check service and ID. Error: ${requestError.message}`));
        });

    } catch (configError) {
         processError(configError); // Handle errors from getApiUrl (missing config)
    }
}


// --- Load Action ---
function load() {
    try {
        const apiUrl = getApiUrl();
        const creatorWebUrl = getCreatorUrl(); // For linking back

        sendRequest(apiUrl)
        .then((text) => {
            const jsonResponse = JSON.parse(text);

            // Assuming the API returns an array of post objects
            if (!Array.isArray(jsonResponse)) {
                throw new Error("Unexpected API response format from Kemono.");
            }

            let results = [];
            for (const post of jsonResponse) {
                // Assuming the API provides these fields:
                // post.id (unique post identifier)
                // post.title
                // post.user (creator ID, redundant here)
                // post.service (redundant here)
                // post.published (ISO 8601 string timestamp)
                // post.added (ISO 8601 string timestamp - maybe use this?)
                // post.content (HTML content string)
                // post.attachments (array of { name: string, path: string })
                // post.file (object { name: string, path: string }) - for single file posts

                const postUrl = `${creatorWebUrl}/post/${post.id}`;
                // Use 'published' or 'added' date. 'added' might be more relevant for Kemono.
                const postDate = new Date(post.added || post.published || Date.now());

                let item = Item.createWithUriDate(postUrl, postDate);
                item.title = post.title || "Untitled Post";

                // Use the provided HTML content. Be aware it might be complex/unsafe.
                // Tapestry will sanitize/limit it for display.
                item.body = post.content || "<p>No content.</p>";

                // Add attachments
                item.attachments = [];
                if (post.attachments && Array.isArray(post.attachments)) {
                    for (const attachment of post.attachments) {
                        if (attachment.path) {
                            // Construct full URL for the attachment
                            const attachmentUrl = site + attachment.path;
                            const mediaAtt = MediaAttachment.createWithUrl(attachmentUrl);
                            // Try to guess mime type from name, otherwise let Tapestry handle it
                            mediaAtt.mimeType = guessMimeType(attachment.name);
                            mediaAtt.text = attachment.name || "Attachment"; // Accessibility text
                            item.attachments.push(mediaAtt);
                        }
                    }
                }
                // Handle single file posts if the structure is different
                 if (post.file && post.file.path && !post.attachments?.length) {
                     const fileUrl = site + post.file.path;
                     const fileAtt = MediaAttachment.createWithUrl(fileUrl);
                     fileAtt.mimeType = guessMimeType(post.file.name);
                     fileAtt.text = post.file.name || "File Attachment";
                     item.attachments.push(fileAtt);
                 }

                results.push(item);
            }
            processResults(results);
        })
        .catch((requestError) => {
            console.error("Kemono load error: " + requestError);
            processError(new Error(`Failed to load posts for ${service}/${creator_id}. Error: ${requestError.message}`));
        });

    } catch (configError) {
         processError(configError); // Handle errors from getApiUrl (missing config)
    }
}

// --- Helper to guess Mime Type (Very Basic) ---
function guessMimeType(filename) {
    if (!filename) return null;
    const lowerCaseName = filename.toLowerCase();
    if (lowerCaseName.endsWith(".png")) return "image/png";
    if (lowerCaseName.endsWith(".jpg") || lowerCaseName.endsWith(".jpeg")) return "image/jpeg";
    if (lowerCaseName.endsWith(".gif")) return "image/gif";
    if (lowerCaseName.endsWith(".webp")) return "image/webp";
    if (lowerCaseName.endsWith(".mp4")) return "video/mp4";
    if (lowerCaseName.endsWith(".mov")) return "video/quicktime";
    if (lowerCaseName.endsWith(".webm")) return "video/webm";
    if (lowerCaseName.endsWith(".mp3")) return "audio/mpeg";
    if (lowerCaseName.endsWith(".wav")) return "audio/wav";
    if (lowerCaseName.endsWith(".ogg")) return "audio/ogg";
    // Add more common types as needed
    return null; // Let Tapestry infer if unknown
} 