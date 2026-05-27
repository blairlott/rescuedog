I checked the live URL with `?gclid=TEST123` and confirmed the WordPress page loads, then after the age gate it redirects into `rescuedog.lovable.app` while preserving the query string.

What I did not see in the browser network log was any request to `ingest-wp-intent`, so the snippet is present in source but is not firing in the browser path I tested.

Plan:
1. Inspect the exact WordPress HTML snippet placement and code around `ingest-wp-intent`.
2. Confirm whether it is running before/after the age gate redirect and whether the redirect interrupts the POST.
3. If needed, adjust the snippet so it stores the click immediately before redirect and/or fires again on the Lovable app landing page.
4. Verify with a fresh `?gclid=TEST...` URL that the request appears in Network and the backend receives it.