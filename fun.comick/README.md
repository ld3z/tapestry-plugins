This connector displays the latest comic chapter updates from [Comick.io](https://comick.io) for a selected language.

It fetches recently released chapters across various series available on the platform based on your configuration.

**Configuration:**

*   **Select Language:** Choose the desired language for chapter updates from the dropdown list during feed setup.
*   **Include NSFW Content:** Use the toggle in the feed settings to include or exclude chapters marked as NSFW/Erotic by the API.

*Note: This connector relies on the public Comick API. Functionality may change based on API availability and structure.*

**Important Note on Filtering:** If you enable the "Include NSFW Content" option and later disable it, chapters that were already fetched *while the option was enabled* will remain in your feed. To completely remove previously fetched NSFW items after changing the setting, you will need to remove the feed from Tapestry and add it again with the desired setting. 