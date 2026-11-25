// The desktop bridge's fixed facts and the checks main.cjs applies to URLs. Plain Node (unit-tested).
'use strict';
const { ORIGIN } = require('./serve.cjs');

/** Bumped only if a bridge call changes shape (later steps fill in stubs; they do not change names or arguments). */
const BRIDGE_VERSION = 1;

/**
 * What this build can do, for window.desktop.info().capabilities. Later steps add their own names here when their
 * stubs are filled in: 'files.saveStream' (export straight to a file) and 'native.run:<tool>' (bundled tools).
 */
const CAPABILITIES = ['media.link', 'media.urlFor', 'media.read', 'media.reveal', 'media.pick', 'shell.openExternal', 'print.toPDF', 'exports.power', 'disk.space', 'native.models'];

/** Command-line tools native.run may start (electron/native.cjs holds the list; 'native.run:<tool>' joins the capabilities when its binary is in place). */
const NATIVE_TOOLS = ['whisper'];

/** Is this URL one of the app's own pages (app://promo-studio/...)? */
function fromApp(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}` === ORIGIN;
  } catch {
    return false;
  }
}

/** May this URL open in the default browser, mail or phone app? Web pages (http, https), mailto and tel only. */
function externalAllowed(url) {
  if (typeof url !== 'string' || url.length > 8192) return false;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') return !!u.hostname && !u.username && !u.password;
    return u.protocol === 'mailto:' || u.protocol === 'tel:';
  } catch {
    return false;
  }
}

module.exports = { BRIDGE_VERSION, CAPABILITIES, NATIVE_TOOLS, fromApp, externalAllowed };
