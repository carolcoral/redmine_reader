/*
 * Redmine Reader — main renderer script (loaded on /reader/:id pages).
 *
 * Reads window.REDMINE_READER (metadata + i18n injected by the Rails view),
 * fetches the attachment bytes through Redmine's native download URL
 * (session cookies apply), then dispatches to a format-specific renderer.
 * Heavy vendor libraries are lazy-loaded per format: viewing a markdown
 * file does not load pdf.js, etc.
 *
 * Security notes:
 * - HTML is only ever injected for markdown, and only after DOMPurify.
 * - Text, excel and code cells use textContent exclusively.
 */
(function () {
  'use strict';

  var cfg = window.REDMINE_READER;
  if (!cfg) { return; }
  var i18n = cfg.i18n || {};
  var t = function (key, fallback) { return i18n[key] || fallback || key; };

  var ASSETS = '/plugin_assets/redmine_reader/';
  var VENDOR = ASSETS + 'javascripts/vendor/';

  // ------------------------------------------------------------------
  // DOM helpers
  // ------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  var viewport = $('rr-viewport');
  var loadingEl = $('rr-loading');
  var errorEl = $('rr-error');
  var errorTitle = $('rr-error-title');
  var errorBody = $('rr-error-body');
  var controls = $('rr-controls');

  function extOf(name) {
    if (!name) { return ''; }
    var i = String(name).lastIndexOf('.');
    return i > -1 ? String(name).slice(i + 1).toLowerCase() : '';
  }

  function paperEl(extraClass) {
    var paper = document.createElement('div');
    paper.className = 'rr-paper' + (extraClass ? ' ' + extraClass : '');
    viewport.appendChild(paper);
    return paper;
  }

  function hideLoading() {
    if (loadingEl) { loadingEl.classList.add('rr-hidden'); }
  }

  function showError(err) {
    if (window.console && err) { console.error('[redmine_reader]', err); }
    hideLoading();
    if (errorTitle) { errorTitle.textContent = t('errorTitle', 'Unable to preview this document'); }
    if (errorBody) {
      var msg = (err && err.message) ? String(err.message).slice(0, 200) : '';
      errorBody.textContent = t('errorBody', 'The document could not be rendered in your browser.') + (msg ? ' (' + msg + ')' : '');
    }
    if (errorEl) { errorEl.classList.remove('rr-hidden'); }
  }

  function showUnsupported(unknown) {
    hideLoading();
    if (errorTitle) { errorTitle.textContent = unknown ? t('unknownFormat', 'This file type cannot be previewed.') : t('unsupportedTitle', 'Preview is not available for this format'); }
    if (errorBody) { errorBody.textContent = unknown ? t('errorBody', 'The document could not be rendered in your browser.') : t('unsupportedBody', 'Legacy binary formats cannot be rendered in the browser. Please download the file and open it locally.'); }
    if (errorEl) { errorEl.classList.remove('rr-hidden'); }
  }

  // ------------------------------------------------------------------
  // Resource loading
  // ------------------------------------------------------------------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function fetchArrayBuffer() {
    return fetch(cfg.downloadUrl, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.arrayBuffer();
    });
  }

  function decodeText(buf) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      try { return new TextDecoder('gbk').decode(buf); }
      catch (e2) { return new TextDecoder('utf-8').decode(buf); }
    }
  }

  // ------------------------------------------------------------------
  // Toolbar controls
  // ------------------------------------------------------------------
  function makeControlBtn(title, labelSvg, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rr-btn rr-btn-ghost';
    b.title = title;
    b.setAttribute('aria-label', title);
    if (labelSvg) { b.innerHTML = labelSvg; }
    if (label) {
      var s = document.createElement('span');
      s.className = 'rr-btn-label';
      s.textContent = label;
      b.appendChild(s);
    }
    b.addEventListener('click', onClick);
    controls.appendChild(b);
    return b;
  }

  var SVG_PLUS = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
  var SVG_MINUS = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>';
  var SVG_FIT = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 0h2v6h-6v-2h4v-4z"/></svg>';
  var SVG_WRAP = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3 3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"/></svg>';
  var SVG_PREV = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
  var SVG_NEXT = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

  // ------------------------------------------------------------------
  // Markdown renderer (marked -> DOMPurify -> highlight.js)
  // ------------------------------------------------------------------
  function decorateMarkdown(article) {
    // Disable GFM task-list checkboxes (they are a static preview).
    Array.prototype.forEach.call(article.querySelectorAll('input[type=checkbox]'), function (cb) {
      cb.setAttribute('disabled', 'disabled');
    });
    // Wrap tables for horizontal scrolling.
    Array.prototype.forEach.call(article.querySelectorAll('table'), function (tbl) {
      if (tbl.parentElement && tbl.parentElement.classList.contains('rr-table-wrap')) { return; }
      var wrap = document.createElement('div');
      wrap.className = 'rr-table-wrap';
      tbl.parentElement.insertBefore(wrap, tbl);
      wrap.appendChild(tbl);
    });
  }

  function addCopyButtons(article) {
    var copyText = t('copyCode', 'Copy');
    var copiedText = t('copied', 'Copied');
    Array.prototype.forEach.call(article.querySelectorAll('pre'), function (pre) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rr-copy-btn';
      btn.textContent = copyText;
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var text = code ? code.textContent : pre.textContent;
        function done() {
          btn.textContent = copiedText;
          btn.classList.add('rr-copy-ok');
          window.setTimeout(function () {
            btn.textContent = copyText;
            btn.classList.remove('rr-copy-ok');
          }, 1500);
        }
        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { window.document.execCommand('copy'); } catch (e) { /* noop */ }
          document.body.removeChild(ta);
          done();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else {
          fallback();
        }
      });
      pre.appendChild(btn);
    });
  }

  function renderMarkdown(buf) {
    return loadScript(VENDOR + 'marked.min.js')
      .then(function () { return loadScript(VENDOR + 'purify.min.js'); })
      .then(function () {
        var text = decodeText(buf);
        var html = '';
        try {
          html = window.marked.parse(text, { gfm: true, breaks: false });
        } catch (e) {
          html = '';
        }
        var safe = window.DOMPurify.sanitize(html);
        var paper = paperEl('rr-paper-md');
        var article = document.createElement('article');
        article.className = 'rr-markdown-body';
        article.innerHTML = safe;
        paper.appendChild(article);
        decorateMarkdown(article);
        // highlight.js is progressive enhancement — failure is non-fatal.
        return loadScript(VENDOR + 'highlight.min.js').then(function () {
          Array.prototype.forEach.call(article.querySelectorAll('pre > code'), function (codeEl) {
            try { window.hljs.highlightElement(codeEl); } catch (e) { /* noop */ }
          });
          addCopyButtons(article);
        }).catch(function () { addCopyButtons(article); });
      });
  }

  // ------------------------------------------------------------------
  // Text renderer
  // ------------------------------------------------------------------
  function renderText(buf) {
    return new Promise(function (resolve) {
      var text = decodeText(buf);
      var paper = paperEl('rr-paper-text');
      var pre = document.createElement('pre');
      pre.className = 'rr-text-pre';
      pre.textContent = text;
      paper.appendChild(pre);
      makeControlBtn(t('wrap', 'Toggle line wrap'), SVG_WRAP, '', function () {
        pre.classList.toggle('rr-nowrap');
      });
      resolve();
    });
  }

  // ------------------------------------------------------------------
  // PDF renderer (pdf.js)
  // ------------------------------------------------------------------
  function renderPdf(buf) {
    return loadScript(VENDOR + 'pdf.min.js').then(function () {
      var pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
      return pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function (pdf) {
      var paper = paperEl('rr-paper-pdf');
      var state = { userScale: null, baseScale: null };
      var renderTaskChain = Promise.resolve();

      function availableWidth() {
        return Math.max(280, viewport.clientWidth - 48);
      }

      function renderAll() {
        var scale = state.userScale || state.baseScale || 1;
        renderTaskChain = renderTaskChain.then(function () {
          paper.innerHTML = '';
          var chain = Promise.resolve();
          var total = pdf.numPages;
          for (var num = 1; num <= total; num++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                  if (state.baseScale === null) {
                    var vp1 = page.getViewport({ scale: 1 });
                    state.baseScale = availableWidth() / vp1.width;
                    if (state.userScale === null) { scale = state.baseScale; }
                  }
                  var vp = page.getViewport({ scale: scale });
                  var dpr = window.devicePixelRatio || 1;
                  var wrapEl = document.createElement('div');
                  wrapEl.className = 'rr-pdf-page-wrap';
                  var canvas = document.createElement('canvas');
                  canvas.className = 'rr-pdf-page';
                  canvas.width = Math.floor(vp.width * dpr);
                  canvas.height = Math.floor(vp.height * dpr);
                  canvas.style.width = Math.floor(vp.width) + 'px';
                  canvas.style.height = Math.floor(vp.height) + 'px';
                  var label = document.createElement('div');
                  label.className = 'rr-pdf-page-label';
                  label.textContent = t('page', 'Page') + ' ' + pageNum + ' ' + t('of', '/') + ' ' + total;
                  wrapEl.appendChild(canvas);
                  wrapEl.appendChild(label);
                  paper.appendChild(wrapEl);
                  return page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: vp,
                    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
                  }).promise;
                });
              });
            })(num);
          }
          return chain;
        });
        return renderTaskChain;
      }

      var renderSeq = 0;
      function rerender() {
        var seq = ++renderSeq;
        renderAll().then(function () {
          if (seq !== renderSeq) { return; } // superseded
        }).catch(function (err) {
          if (seq === renderSeq) { showError(err); }
        });
      }

      makeControlBtn(t('zoomOut', 'Zoom out'), SVG_MINUS, '', function () {
        state.userScale = Math.max(0.25, (state.userScale || state.baseScale || 1) * 0.85);
        rerender();
      });
      makeControlBtn(t('zoomIn', 'Zoom in'), SVG_PLUS, '', function () {
        state.userScale = Math.min(5, (state.userScale || state.baseScale || 1) * 1.18);
        rerender();
      });
      makeControlBtn(t('fitWidth', 'Fit width'), SVG_FIT, '', function () {
        state.userScale = null;
        state.baseScale = null;
        rerender();
      });

      var resizeTimer = null;
      window.addEventListener('resize', function () {
        if (state.userScale !== null) { return; } // only in fit-width mode
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          state.baseScale = null;
          rerender();
        }, 200);
      });

      return renderAll();
    });
  }

  // ------------------------------------------------------------------
  // DOCX renderer (docx-preview)
  // ------------------------------------------------------------------
  function renderDocx(buf) {
    return loadScript(VENDOR + 'jszip.min.js')
      .then(function () { return loadScript(VENDOR + 'docx-preview.min.js'); })
      .then(function () {
        var paper = paperEl('rr-paper-docx');
        return window.docx.renderAsync(buf, paper, null, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: false,
          useBase64URL: true
        });
      });
  }

  // ------------------------------------------------------------------
  // Excel renderer (SheetJS) — DOM built with textContent only
  // ------------------------------------------------------------------
  var MAX_EXCEL_ROWS = 10000;

  function renderExcel(buf) {
    return loadScript(VENDOR + 'xlsx.full.min.js').then(function () {
      var wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      var sheetNames = wb.SheetNames || [];
      if (!sheetNames.length) { throw new Error('empty workbook'); }

      var paper = paperEl('rr-paper-excel');
      var tabBar = document.createElement('div');
      tabBar.className = 'rr-sheet-bar';
      var sheetHost = document.createElement('div');
      sheetHost.className = 'rr-sheet-host';
      paper.appendChild(tabBar);
      paper.appendChild(sheetHost);

      function cellText(cell) {
        if (cell == null) { return ''; }
        if (cell.w != null) { return String(cell.w); } // formatted text
        if (cell.v != null) {
          if (cell.v instanceof Date) {
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            return cell.v.getFullYear() + '-' + pad(cell.v.getMonth() + 1) + '-' + pad(cell.v.getDate());
          }
          return String(cell.v);
        }
        return '';
      }

      function showSheet(idx) {
        Array.prototype.forEach.call(tabBar.children, function (tab, i) {
          tab.classList.toggle('rr-active', i === idx);
        });
        sheetHost.innerHTML = '';
        var ws = wb.Sheets[sheetNames[idx]];
        var rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) || [];
        var table = document.createElement('table');
        table.className = 'rr-sheet-table';
        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');

        var shown = Math.min(rows.length, MAX_EXCEL_ROWS);
        for (var r = 0; r < shown; r++) {
          var src = rows[r] || [];
          var tr = document.createElement('tr');
          for (var c = 0; c < src.length; c++) {
            var td = document.createElement(r === 0 ? 'th' : 'td');
            td.textContent = cellText(src[c]);
            tr.appendChild(td);
          }
          (r === 0 ? thead : tbody).appendChild(tr);
        }
        table.appendChild(thead);
        table.appendChild(tbody);
        sheetHost.appendChild(table);

        if (rows.length > MAX_EXCEL_ROWS) {
          var note = document.createElement('div');
          note.className = 'rr-sheet-note';
          note.textContent = t('page', 'Page') + ' ' + (MAX_EXCEL_ROWS) + '+';
          sheetHost.appendChild(note);
        }
      }

      sheetNames.forEach(function (name, idx) {
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'rr-sheet-tab';
        tab.textContent = name;
        tab.title = t('sheet', 'Sheet') + ': ' + name;
        tab.addEventListener('click', function () { showSheet(idx); });
        tabBar.appendChild(tab);
      });

      showSheet(0);
    });
  }

  // ------------------------------------------------------------------
  // PPTX renderer (pptx-preview)
  //
  // Use mode: 'slide' (one slide at a time) so the content never overflows
  // the paper container horizontally. The library's built-in next/prev/
  // pagination widgets are visually hidden via CSS (see .rr-paper-pptx
  // styles) and replaced by our own i18n-aware controls in the toolbar.
  // ------------------------------------------------------------------
  function renderPptx(buf) {
    return loadScript(VENDOR + 'pptx-preview.min.js').then(function () {
      var paper = paperEl('rr-paper-pptx');
      var container = document.createElement('div');
      container.className = 'rr-pptx-container';
      paper.appendChild(container);

      var width = Math.max(320, Math.min(960, viewport.clientWidth - 48));
      var height = Math.round(width * 0.5625); // 16:9
      var previewer = window.pptxPreview.init(container, {
        width: width,
        height: height,
        mode: 'slide'
      });

      return previewer.preview(buf).then(function (pptx) {
        var total = (pptx && pptx.slides) ? pptx.slides.length : (previewer.slideCount || 0);

        var label = document.createElement('span');
        label.className = 'rr-pptx-label';
        controls.appendChild(label);
        function refreshLabel() {
          var cur = (previewer.currentIndex || 0) + 1;
          label.textContent = t('slide', 'Slide') + ' ' + cur + ' ' + t('of', '/') + ' ' + total;
        }

        makeControlBtn(t('prevSlide', 'Previous slide'), SVG_PREV, '', function () {
          previewer.renderPreSlide();
          refreshLabel();
        });
        makeControlBtn(t('nextSlide', 'Next slide'), SVG_NEXT, '', function () {
          previewer.renderNextSlide();
          refreshLabel();
        });

        refreshLabel();
      });
    });
  }

  // ------------------------------------------------------------------
  // Dispatch
  // ------------------------------------------------------------------
  var RENDERERS = {
    pdf: renderPdf,
    docx: renderDocx,
    md: renderMarkdown,
    markdown: renderMarkdown,
    txt: renderText,
    log: renderText,
    csv: renderExcel,
    xls: renderExcel,
    xlsx: renderExcel,
    xlsm: renderExcel,
    pptx: renderPptx
  };

  function start() {
    var ext = extOf(cfg.filename);
    var badgeEl = $('rr-badge');
    if (badgeEl) { badgeEl.textContent = ext ? ext.toUpperCase() : '?'; }

    var printBtn = $('rr-print');
    if (printBtn) {
      printBtn.addEventListener('click', function () { window.print(); });
    }

    var renderer = RENDERERS[ext];
    if (!renderer) {
      // Legacy binaries (.doc/.ppt) and unknown types: friendly fallback.
      showUnsupported(ext === 'doc' || ext === 'ppt' ? false : true);
      return;
    }

    fetchArrayBuffer().then(function (buf) {
      hideLoading();
      return renderer(buf);
    }).catch(function (err) {
      showError(err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
