// Deploy: Extensions > Apps Script in a Google Sheet, paste this, then
// Deploy > New deployment > Web app, "Execute as: Me", "Who has access: Anyone".
// Paste the resulting /exec URL into config.js -> endpoints.sheets.

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = e.parameter || {}; }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Votes") ||
    SpreadsheetApp.getActiveSpreadsheet().insertSheet("Votes");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ts", "sessionId", "pairId", "roundIndex", "choice", "choiceSide", "ua", "referrer"]);
  }
  sheet.appendRow([
    data.ts || new Date().toISOString(),
    data.sessionId || "",
    data.pairId || "",
    data.roundIndex != null ? data.roundIndex : "",
    data.choice || "",
    data.choiceSide || "",
    data.ua || "",
    data.referrer || ""
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = (e.parameter && e.parameter.action) || "";
  if (action === "results") {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Votes");
    if (!sheet) return json_({ error: "no Votes sheet" });
    var rows = sheet.getDataRange().getValues();
    return json_({ header: rows[0], rows: rows.slice(1) });
  }
  return json_({ ok: true, hint: "use ?action=results" });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
