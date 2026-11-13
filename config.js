// ==========================================================================
// Family Photo Frame — configuration
// Fill in the values below, then push this folder to GitHub Pages.
// ==========================================================================

window.CONFIG = {
  // Photos come from a PRIVATE Drive folder ("Family Frame") through the
  // Apps Script in apps-script/Code.gs, running in Chris's Google account.
  // It only answers devices that know the passcode; each device asks for it
  // once. The folder ID and passcode live in the script's settings, not here.
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzJyzxaawYv4FVSmuxdQ-zb24Io2QDhntocYOJMpo7h6WjQeITpy_3r1ibZBRVU4FaS/exec",

  // Only show photos that fit the screen's shape: skip any that filling the
  // screen would crop by more than this fraction (0.10 = 10%). On the 16:10
  // tablets that keeps 3:2 and 16:9 photos and skips 4:3, square and other
  // odd shapes. Set to 1 to show everything. Override per device with ?crop=.
  MAX_CROP: 0.10,

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
