/**
 * photoframe — private photo server (Google Apps Script)
 *
 * Runs in Chris's Google account and hands photos from a PRIVATE Drive
 * folder to the family frame, but only when the request carries the right
 * passcode. The folder itself is never shared, so its ID is useless to
 * anyone else.
 *
 * One-time setup (Project Settings → Script Properties):
 *   PASSCODE   the passcode the tablets will enter (8+ characters)
 *   FOLDER_ID  the Drive folder's ID (the end of its URL)
 *
 * Services (+ next to "Services" in the left sidebar) → Drive API → Add
 *
 * Deploy → New deployment → Web app
 *   Execute as:      Me
 *   Who has access:  Anyone
 * ("Anyone" lets the tablets reach it without signing in; the passcode is
 *  the lock.)
 */

var MAX_FAILS = 10;          // wrong passcodes allowed…
var LOCK_SECONDS = 15 * 60;  // …per 15 minutes, then everything is refused

function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents || "{}"); } catch (err) {}
  try {
    return respond_(handle_(req));
  } catch (err) {
    // Send the reason back so the frame can show it.
    return respond_({ error: "server", message: String(err && err.message || err) });
  }
}

// A plain visit in a browser just confirms the script is running.
function doGet() {
  return respond_({ ok: true, service: "photoframe" });
}

function handle_(req) {
  var props = PropertiesService.getScriptProperties();
  var passcode = props.getProperty("PASSCODE");
  var folderId = props.getProperty("FOLDER_ID");
  if (!passcode || !folderId) return { error: "setup", message: "PASSCODE and FOLDER_ID script properties are not set." };

  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("fails") || 0);
  if (fails >= MAX_FAILS) return { error: "locked" };

  if (!sameText_(String(req.pass || ""), passcode)) {
    cache.put("fails", String(fails + 1), LOCK_SECONDS);
    Utilities.sleep(1000); // slow down guessing
    return { error: "passcode" };
  }

  if (req.img) return image_(req.img, req.box);
  return { files: listFolder_(folderId) };
}

// Every image in the folder, with the metadata the frame uses and a
// short-lived thumbnail link the tablet can load directly.
function listFolder_(folderId) {
  if (typeof Drive === "undefined") {
    throw new Error("Add the Drive API service to the script (Services + → Drive API).");
  }
  var files = [];
  var pageToken = null;
  do {
    var res = Drive.Files.list({
      q: "'" + folderId + "' in parents and trashed=false and mimeType contains 'image/'",
      pageSize: 1000,
      fields: "nextPageToken,files(id,name,description,thumbnailLink,imageMediaMetadata(width,height,rotation,time,cameraMake,cameraModel))",
      pageToken: pageToken
    });
    (res.files || []).forEach(function (f) {
      if (!f.thumbnailLink) return; // Drive hasn't made a preview yet; it will on a later check
      files.push({
        id: f.id,
        name: f.name,
        description: f.description || "",
        imageMediaMetadata: f.imageMediaMetadata || {},
        thumb: f.thumbnailLink
      });
    });
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return files;
}

// Fallback for when a thumbnail link won't load on the tablet: fetch the
// preview here, with the account's own access, and send the bytes back.
function image_(id, box) {
  var token = ScriptApp.getOAuthToken();
  var meta = Drive.Files.get(id, { fields: "thumbnailLink,parents" });
  // Only serve files that live in the frame's folder.
  var folderId = PropertiesService.getScriptProperties().getProperty("FOLDER_ID");
  if (!meta.parents || meta.parents.indexOf(folderId) < 0 || !meta.thumbnailLink) return { error: "notfound" };
  var size = /^w\d+-h\d+$/.test(box || "") ? box : "w1920-h1280";
  var link = meta.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, "=" + size);
  var blob = UrlFetchApp.fetch(link, { headers: { Authorization: "Bearer " + token } }).getBlob();
  return { type: blob.getContentType() || "image/jpeg", data: Utilities.base64Encode(blob.getBytes()) };
}

function sameText_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Not called. Its presence makes Google ask for read access to Drive when
// the script is first authorized, which listFolder_ needs.
function driveScopeHint_() { DriveApp.getRootFolder(); }
