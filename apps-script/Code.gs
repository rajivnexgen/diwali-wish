/**
 * AADTECH Diwali Voucher Bridge, bound to the existing private Google Sheet.
 * The only permitted caller is the Hostinger Flask backend holding BRIDGE_SECRET.
 * No OTP or email required. Never send this secret to the browser.
 * No real voucher codes or link tokens belong in the source.
 */
const VOUCHERS_SPREADSHEET_ID = '13OGBaycDMzoOGlykcDJToU1LVilRVRJwwldTKy5RXrg';
const VOUCHERS_TAB = 'Vouchers';
const LINK_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const BRIDGE_SECRET_PATTERN = /^[0-9a-f]{64}$/;

function doGet() {
  return json_({ok: false, error: 'POST required'});
}

function doPost(event) {
  try {
    const raw = event && event.postData && event.postData.contents;
    if (typeof raw !== 'string' || raw.length < 2 || raw.length > 2048) {
      return json_({ok: false, error: 'Invalid request'});
    }
    const data = JSON.parse(raw);
    const configuredSecret = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if (!configuredSecret || !BRIDGE_SECRET_PATTERN.test(configuredSecret) ||
        !safeEquals_(data.secret, configuredSecret)) {
      return json_({ok: false, error: 'Unauthorized'});
    }
    if (data.action !== 'lookup' && data.action !== 'reveal') {
      return json_({ok: false, error: 'Unsupported action'});
    }
    if (typeof data.token !== 'string' || !LINK_TOKEN_PATTERN.test(data.token)) {
      return json_({ok: false, error: 'Invalid gift link'});
    }

    // Prevent two concurrent requests from assigning the first-reveal timestamp twice.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return json_({ok: false, error: 'Busy; try again'});
    }
    try {
      return handleVoucher_(data.action, data.token);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    // Deliberately do not log request bodies, bearer tokens, or voucher codes.
    console.error('Voucher bridge operation failed');
    return json_({ok: false, error: 'Gift service temporarily unavailable'});
  }
}

function handleVoucher_(action, token) {
  const spreadsheet = SpreadsheetApp.openById(VOUCHERS_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(VOUCHERS_TAB);
  if (!sheet) return json_({ok: false, error: 'Gift service unavailable'});
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ok: false, error: 'Invalid gift link'});

  // Read A:L only; never expose the full Sheet to a requester.
  const records = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  let foundIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (typeof records[i][5] === 'string' && records[i][5] === token) {
      // Duplicate tokens must not resolve to any voucher.
      if (foundIndex !== -1) return json_({ok: false, error: 'Invalid gift link'});
      foundIndex = i;
    }
  }
  if (foundIndex < 0) return json_({ok: false, error: 'Invalid gift link'});

  const row = foundIndex + 2;
  const record = records[foundIndex];
  const voucherCode = String(record[4] === null ? '' : record[4]).trim();
  const oldStatus = String(record[9] || '').trim().toUpperCase();
  const status = oldStatus === 'DISABLED' ? 'DISABLED'
    : !voucherCode ? 'PENDING'
    : oldStatus === 'REVEALED' ? 'REVEALED'
    : 'READY';

  if (action === 'lookup') {
    if (!record[10]) sheet.getRange(row, 11).setValue(new Date());
    if (status === 'READY' && !oldStatus) sheet.getRange(row, 10).setValue('READY');
    SpreadsheetApp.flush();
    return json_({
      ok: true,
      name: String(record[0] || '').slice(0, 120),
      denomination: amount_(record[3]),
      status: status
    });
  }

  if (status === 'DISABLED') return json_({ok: false, error: 'Gift link disabled'});
  if (status === 'PENDING') return json_({ok: false, error: 'Your gift is not ready yet'});
  if (status === 'READY') sheet.getRange(row, 10).setValue('REVEALED');
  if (!record[11]) sheet.getRange(row, 12).setValue(new Date());
  SpreadsheetApp.flush();

  // This is the ONLY action that returns the actual code, and only for one matched token.
  return json_({
    ok: true,
    status: 'REVEALED',
    voucher_code: voucherCode,
    redeem_url: 'https://www.amazon.in/gc/redeem'
  });
}

function amount_(value) {
  if (typeof value === 'number') return value;
  return Number(String(value || '').replace(/[^0-9.]/g, '')) || 0;
}

function safeEquals_(provided, expected) {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional: run once from the Script Editor after configuring BRIDGE_SECRET,
 * to trigger Google's owner-only authorization dialog and check tab access.
 * Does not read voucher codes or modify the Sheet.
 */
function authorizeBridge() {
  const props = PropertiesService.getScriptProperties();
  if (!BRIDGE_SECRET_PATTERN.test(String(props.getProperty('BRIDGE_SECRET') || ''))) {
    throw new Error('Set a random 64-character hex BRIDGE_SECRET in Script Properties first');
  }
  const tab = SpreadsheetApp.openById(VOUCHERS_SPREADSHEET_ID).getSheetByName(VOUCHERS_TAB);
  if (!tab) throw new Error('Vouchers tab not found');
  console.log('Bridge authorized; sheet accessible, rows=' + tab.getLastRow());
}
