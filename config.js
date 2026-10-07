// ==========================================================================
// Family Photo Frame — configuration
// Fill in the values below, then push this folder to GitHub Pages.
// ==========================================================================

window.CONFIG = {
  // Google Cloud API key with the Drive API enabled.
  // Restrict it (HTTP referrers = your GitHub Pages URL) before going live.
  GOOGLE_API_KEY: "AIzaSyAgA2IrOMxRlo8fEjTdUcAvp9y7-uMpavI",

  // The ID of a public Google Drive folder full of photos.
  // Share the folder as "Anyone with the link — Viewer", then grab the ID
  // from the folder's URL: https://drive.google.com/drive/folders/<THIS_PART>
  DRIVE_FOLDER_ID: "1_RwB7K645IunJGV_za_tt2jQCPjR80He",

  // How many seconds each photo stays on screen.
  PHOTO_INTERVAL_SECONDS: 10,

  // How often (minutes) to re-check the Drive folder for new/removed photos.
  PHOTOS_REFRESH_MINUTES: 5,

  // Whether the photo caption is shown the first time the page loads.
  // Double-tap the left half of the screen to turn it on/off; that choice is
  // then remembered on the device.
  CAPTION_ON_BY_DEFAULT: false,

  // Caption extras (the date taken and any Drive description show when the
  // caption is on).
  SHOW_FILENAME: false,
  SHOW_CAMERA: false,
};
