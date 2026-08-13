# Family Photo Frame

A full-screen digital photo frame for a wall-mounted Fire HD 10, built as a
plain static website (no app store, no subscription). It slideshows photos
pulled from a public Google Drive folder, with a small clock overlay.

## 1. Create a Google Cloud API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), create a project (any name).
2. **APIs & Services → Library** — enable the **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → API key.** Copy the key.
4. Click the new key → **Restrict key**:
   - Application restrictions → **Websites** → add `https://<your-github-username>.github.io/*`
   - API restrictions → limit to **Google Drive API** only.

   This matters because the key will sit in public JavaScript on GitHub Pages — restricting it stops anyone else from using it elsewhere.

## 2. Make a public photo folder

1. In Google Drive, create a folder (e.g. "Family Photo Frame") and upload photos.
2. Right-click → **Share → General access → Anyone with the link → Viewer**.
3. Open the folder and copy the ID from the URL: `https://drive.google.com/drive/folders/`**`THIS_PART`** (not the whole URL — just that ID string).
4. Adding/removing photos in that folder later (even from your phone) updates the display automatically, within `PHOTOS_REFRESH_MINUTES`.

## 3. Fill in config.js

Open `config.js` and paste in `GOOGLE_API_KEY` and `DRIVE_FOLDER_ID` (both already filled in from your setup). Adjust `PHOTO_INTERVAL_SECONDS` and `PHOTOS_REFRESH_MINUTES` if you want.

## 4. Publish on GitHub Pages

1. Create a new **public** GitHub repository (private repos can't use free GitHub Pages).
2. Upload `index.html`, `style.css`, `app.js`, `config.js` to the repo root.
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → **Save**.
4. You'll get a URL like `https://<username>.github.io/<repo-name>/` — that's your display's address. Make sure it matches the website restriction on the API key from step 1.

## 5. Set up the Fire HD 10

**Keep the screen from sleeping:**
Settings → Device Options → tap "Serial Number" 7 times to unlock Developer Options → enable **Stay Awake**. Also remove any lock screen PIN under Settings → Security.

**Load the page full-screen, one of two ways:**

- *Simple:* Open the GitHub Pages URL in Silk browser, then browser menu → **Add to Home Screen**.
- *More locked-down:* Install **Fully Kiosk Browser** from the Amazon Appstore, set its start URL to your GitHub Pages link, enable kiosk/auto-start — this also auto-relaunches after a reboot or crash.

**Mount it**, plug it in, done.

## Troubleshooting

- **No photos showing / status line says it couldn't load photos:** confirm `DRIVE_FOLDER_ID` is the bare ID string, not the full sharing URL, and that the folder is actually shared "Anyone with the link."
- **Works locally but not on the tablet (or vice versa):** the API key's website restriction only allows requests from your GitHub Pages URL — test on that live URL, not a local file.
- **Photos load once but never rotate:** check `PHOTO_INTERVAL_SECONDS` in `config.js` — it's in seconds, not minutes.

## Making changes later

Edit the files and push to GitHub — the live page updates within a minute. No rebuild step, no app store review.
