/*
 * Redmine Reader — global entry script.
 *
 * Rewrites supported attachment links (/attachments/download/:id/:filename)
 * so that clicking them opens the reader page (/reader/:id) instead of
 * downloading. Left click, middle click, "open in new tab" and
 * "copy link address" all lead to the preview page.
 *
 * - Idempotent: rewritten links are flagged with data-download-url.
 * - Non-whitelisted files (zip, images, ...) keep Redmine's native behavior.
 * - The original download URL is preserved in data-download-url; the reader
 *   toolbar exposes it as a download button.
 * - Turbo aware: listens to DOMContentLoaded, turbo:load and
 *   turbo:frame-load; a debounced MutationObserver catches late-inserted
 *   attachment lists.
 */
(function () {
  'use strict';

  var WHITELIST = {
    pdf: 1,
    docx: 1,
    md: 1, markdown: 1,
    txt: 1, log: 1,
    csv: 1,
    xls: 1, xlsx: 1, xlsm: 1,
    pptx: 1
  };

  // /attachments/download/:id/:filename — with optional query/hash parts.
  var ATTACHMENT_RE = /^(?:https?:\/\/[^\/?#]+)?\/attachments\/download\/(\d+)(?:\/([^\/?#]*))?([^#]*)?/;

  function extOf(name) {
    if (!name) { return ''; }
    var i = String(name).lastIndexOf('.');
    return i > -1 ? String(name).slice(i + 1).toLowerCase() : '';
  }

  function queryParam(href, key) {
    try {
      var u = new URL(href, window.location.origin);
      return u.searchParams.get(key) || '';
    } catch (e) {
      return '';
    }
  }

  function isExplicitDownloadLink(a) {
    // Links that are clearly meant as "download" affordances (icon-only or
    // marked download buttons) keep their native behavior.
    var cls = a.getAttribute('class') || '';
    if (/(^|\s)(icon-only|icon-download|attachment-download)(\s|$)/.test(cls)) { return true; }
    var iconCount = a.querySelectorAll('img, svg, i').length;
    var text = (a.textContent || '').replace(/\s+/g, '');
    return iconCount > 0 && text === '';
  }

  function rewrite(root) {
    root = root && root.querySelectorAll ? root : document;
    var links = root.querySelectorAll('a[href*="/attachments/download/"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute('data-download-url')) { continue; } // already rewritten
      var href = a.getAttribute('href') || '';
      var m = href.match(ATTACHMENT_RE);
      if (!m) { continue; }
      var id = m[1];
      if (!id) { continue; }
      if (isExplicitDownloadLink(a)) { continue; }

      var filename = '';
      try { filename = decodeURIComponent(m[2] || ''); } catch (e) { filename = m[2] || ''; }
      filename = filename || queryParam(href, 'filename') || (a.textContent || '').trim();
      var ext = extOf(filename);
      if (!WHITELIST[ext]) { continue; }

      a.setAttribute('data-download-url', href);
      a.setAttribute('href', '/reader/' + id);
    }
  }

  var scheduled = null;
  function schedule() {
    if (scheduled) { return; }
    scheduled = window.setTimeout(function () {
      scheduled = null;
      rewrite();
    }, 100);
  }

  var booted = false;
  function boot() {
    rewrite();
    if (booted || !window.MutationObserver) { return; }
    booted = true;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) {
          schedule();
          return;
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Turbo (Redmine 5.1+) — page visits and lazy-loaded frames.
  document.addEventListener('turbo:load', boot);
  document.addEventListener('turbo:frame-load', function (e) {
    rewrite(e.target && e.target.querySelectorAll ? e.target : document);
  });
})();
