This connector displays the latest comic chapter updates from [Comick.io](https://comick.io) for a **custom list of comics** specified by you.

It fetches recently released chapters only for the comics you choose, in your selected language.

**Configuration:**

*   **Comic Slugs (Required):** Enter a comma-separated list of comic slugs you want to follow.
    *   A comic's slug is the part of its URL on Comick after `/comic/`. For example, in `https://comick.io/comic/one-piece`, the slug is `one-piece`.
    *   Example input: `one-piece,solo-leveling,kagurabachi`
    *   You **must** provide at least one valid slug.
*   **Select Language Code:** Choose the desired language *code* (e.g., `en`, `es`, `ja`) for chapter updates.
*   **Include NSFW Content:** Use the toggle to include or exclude chapters marked as NSFW/Erotic by the API. Note that the `accept_erotic_content` flag might apply globally when fetching chapters, potentially affecting results based on API behavior.

**How it Works:**

1.  The connector takes your list of slugs.
2.  It asks the Comick API for the unique ID (`hid`) of each comic.
3.  It then asks the API for the latest chapters (in your selected language) for each of those comic IDs.
4.  Finally, it combines these chapters, sorts them by release date, and displays the most recent ones in your feed.

*Note: This connector relies on the public Comick API. Functionality may change based on API availability and structure. Entering invalid slugs may result in errors or missing comics.* 