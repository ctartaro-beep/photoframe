# Private photo server

`Code.gs` lets the family frame show photos from a **private** Drive folder.
It runs as a Google Apps Script web app in the folder owner's account and only
answers requests that carry the passcode.

## Setup (once)

1. Go to <https://script.google.com>, click **New project**, name it
   "photoframe server", and replace everything in `Code.gs` with this
   folder's `Code.gs`. Save.
2. **Project Settings** (gear icon) → **Script Properties** → **Add script property**, twice:
   - `PASSCODE`: the passcode the tablets will enter (8+ characters)
   - `FOLDER_ID`: the family Drive folder's ID
3. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy**, then **Authorize access**, and allow it. Google shows an
   "unverified app" warning because it's your own script: click
   **Advanced → Go to photoframe server**.
4. Copy the **Web app URL** (ends in `/exec`) and put it in `config.js` as
   `SCRIPT_URL`.
5. Check the frame shows photos, then set the Drive folder's sharing to
   **Restricted**.

## Notes

- Changing the passcode: edit `PASSCODE` in Script Properties. Each device
  asks for the new one the next time it checks for photos.
- After 10 wrong passcodes in 15 minutes, the script refuses everything for
  15 minutes.
- If you edit `Code.gs` later, use **Deploy → Manage deployments → Edit →
  Version: New version** so the URL stays the same.
