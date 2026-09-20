/* Event page popups: Training and Schedule modals.
   Self-contained: injects the modal markup, fetches the same Notion data as
   index.html, and styles itself with assets/modals.css. Everything is wrapped
   in an IIFE so it never collides with the host page's inline script. */
(function () {
  'use strict';

  var TRAINING_URL = 'https://r.jina.ai/https://teguhpm.notion.site/Pelatihan-3d86fa858bba80129507c7eecc79b5de';
  var JADWAL_URL = 'https://r.jina.ai/https://teguhpm.notion.site/Jadwal-Training-3d76fa858bba80678c5ad21fda12a21f';
  var TRAINING_PAGE_ID = '3d86fa858bba80129507c7eecc79b5de';
  var JADWAL_PAGE_ID = '3d76fa858bba80678c5ad21fda12a21f';
  var SCHEDULE_JSON = '../schedule.json';
  var REFRESH_MS = 5 * 60 * 1000;
  var JADWAL_COLUMNS = ['Tanggal', 'Training', 'Waktu', 'Lokasi', 'Biaya', 'Registrasi'];
  var DEFAULT_REGISTER = 'https://lynk.id/dikodeworks';

  /* Embedded snapshots so the popups still show data when opened straight
     from disk (file://) or when the network/snapshot is unavailable. */
  var SCHEDULE_INLINE = {
    columns: ['Tanggal', 'Training', 'Waktu', 'Lokasi', 'Biaya', 'Registrasi'],
    rows: [[
      { v: 'DD-MM-YYYY', link: null },
      { v: 'Training X', link: null },
      { v: '00:00', link: null },
      { v: 'Online', link: null },
      { v: 'Rp. 0.000.000', link: null },
      { v: 'https://lynk.id/dikodeworks', link: 'https://lynk.id/dikodeworks' }
    ]]
  };

  var TRAINING_INLINE = [{
    id: '001', title: 'Training X',
    modules: [
      { name: 'Module 1 …', items: ['…', '…', '…'] },
      { name: 'Module 2 …', items: ['…', '…', '…'] },
      { name: 'Module 3 …', items: ['…', '…', '…'] },
      { name: 'Module 4 …', items: ['…', '…', '…'] },
      { name: 'Module 5 …', items: ['…', '…', '…'] },
      { name: 'Module 6 …', items: ['…', '…', '…'] },
      { name: 'Module 7 …', items: ['…', '…', '…'] },
      { name: 'Module 8 …', items: ['…', '…', '…'] },
      { name: 'Module 9 …', items: ['…', '…', '…'] },
      { name: 'Module 10 …', items: ['…', '…', '…'] }
    ],
    durasi: 'X Hari (Jam Belajar Mulai Pukul 00.00 s.d 00.00 WIB Perharinya)',
    biaya: 'Rp 0.000.000,-',
    registrasi: 'https://lynk.id/dikodeworks'
  }];

  var STRINGS = {
    en: {
      'modal.training': 'Training',
      'modal.schedule': 'Schedule',
      'training.none': 'No trainings available yet.',
      'training.defaultTitle': 'Training',
      'training.curriculum': 'Curriculum',
      'training.duration': 'Duration',
      'training.investment': 'Investment',
      'training.register': 'Register Now',
      'training.searchPlaceholder': 'Search training…',
      'training.searchEmpty': 'No matching training found.',
      'schedule.updated': 'Last updated at',
      'schedule.register': 'Register',
      'schedule.searchPlaceholder': 'Search training, date, location…',
      'schedule.empty': 'No trainings scheduled yet.',
      'schedule.searchEmpty': 'No matching training found.',
    },
    id: {
      'modal.training': 'Pelatihan',
      'modal.schedule': 'Jadwal',
      'training.none': 'Belum ada pelatihan.',
      'training.defaultTitle': 'Pelatihan',
      'training.curriculum': 'Kurikulum',
      'training.duration': 'Durasi Training',
      'training.investment': 'Biaya Investasi',
      'training.register': 'Registrasi',
      'training.searchPlaceholder': 'Cari pelatihan…',
      'training.searchEmpty': 'Tidak ada pelatihan yang cocok.',
      'schedule.updated': 'Di-update pada',
      'schedule.register': 'Registrasi',
      'schedule.searchPlaceholder': 'Cari pelatihan, tanggal, lokasi…',
      'schedule.empty': 'Belum ada pelatihan dijadwalkan.',
      'schedule.searchEmpty': 'Tidak ada pelatihan yang cocok.',
    },
  };

  function localized(key) {
    var lang = document.documentElement.lang === 'id' ? 'id' : 'en';
    var dict = STRINGS[lang] || STRINGS.en;
    return dict[key] !== undefined ? dict[key] : key;
  }

  /* Only allow http(s), mailto or scheme-less (relative) URLs. */
  function safeUrl(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      return /^(https?|mailto):/i.test(s) ? s : null;
    }
    return s;
  }

  var $ = function (id) { return document.getElementById(id); };

  /* Live Notion data via the public page API (CORS-enabled, no r.jina.ai
     proxy and therefore no abuse rate-limits). Returns text blocks in order. */
  async function notionApiLines(pageId) {
    /* Cache-buster required: the Notion API caches by URL and would otherwise
       serve stale content (e.g. an old Registrasi link). */
    var res = await fetch('https://notion-api.splitbee.io/v1/page/' + pageId + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('notion api ' + res.status);
    var data = await res.json();
    var root = (data[pageId] && data[pageId].value && data[pageId].value.value) || null;
    var out = [];
    var titleOf = function (v) {
      var p = v && v.properties && v.properties.title;
      if (!p) return '';
      try { return p.map(function (x) { return x[0]; }).join(''); } catch (e) { return ''; }
    };
    var walk = function (ids) {
      (ids || []).forEach(function (id) {
        var v = data[id] && data[id].value && data[id].value.value;
        if (!v) return;
        var t = titleOf(v);
        if (t) out.push(t);
        if (v.content && v.content.length) walk(v.content);
      });
    };
    if (root) walk(root.content);
    return out;
  }

  /* ---------- Inject modal markup ---------- */
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function modalMarkup(id, titleKey, bodyHtml) {
    return '<div class="modal" id="' + id + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-title">' +
      '<div class="modal-backdrop" id="' + id + '-backdrop"></div>' +
      '<div class="modal-dialog">' +
        '<div class="modal-header">' +
          '<span class="modal-title" id="' + id + '-title" data-modal-title="' + titleKey + '"></span>' +
          '<button class="modal-close" id="' + id + '-close" aria-label="Close">' + CLOSE_SVG + '</button>' +
        '</div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
      '</div>' +
    '</div>';
  }

  /* Training popup is an embedded Google Sheet. */
  var SHEET_SRC = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQupzYPZjnBr4DHLlp0vtIDr0eVamaMmIttgK7lS1DuYmeslWp_8s59eYaUD7hSWQQpKwRo1PckSuf-/pubhtml?gid=0&single=true&widget=true&headers=false';
  var TRAINING_BODY = '<iframe class="sheet-embed" title="Pelatihan" loading="lazy" src="' + SHEET_SRC + '"></iframe>';

  var JADWAL_BODY =
    '<div class="jadwal-progress" id="sched-progress" role="status" aria-live="polite">' +
      '<span class="jadwal-progress-track"><span class="jadwal-progress-fill" id="sched-progress-fill"></span></span>' +
      '<span class="jadwal-progress-label" id="sched-progress-label">0%</span>' +
    '</div>' +
    '<div class="jadwal-search">' +
      '<input type="search" id="sched-search-input" class="jadwal-search-input" aria-label="Search schedule">' +
      '<button type="button" class="jadwal-search-clear" id="sched-search-clear" aria-label="Clear search">&times;</button>' +
    '</div>' +
    '<div class="jadwal-scroll">' +
      '<table class="jadwal-table"><thead id="sched-head"></thead><tbody id="sched-rows"></tbody></table>' +
    '</div>' +
    '<p class="jadwal-meta" id="sched-meta" aria-live="polite"></p>';

  function injectModals() {
    /* Reuse the markup already in the page when present (event/index.html ships
       it statically so the popups exist even before this script runs). */
    var html = '';
    if (!$('training-modal')) html += modalMarkup('training-modal', 'modal.training', TRAINING_BODY);
    if (!$('jadwal-modal')) html += modalMarkup('jadwal-modal', 'modal.schedule', JADWAL_BODY);
    if (!html) return;
    var host = document.createElement('div');
    host.innerHTML = html;
    while (host.firstChild) document.body.appendChild(host.firstChild);
  }

  /* ---------- Modal controller ---------- */
  var modals = [];
  var lastFocused = null;

  function isTabbable(el) {
    return typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
      : el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
  }

  function focusablesIn(modal) {
    return Array.prototype.slice.call(
      modal.querySelectorAll('a[href], button:not([disabled]), iframe, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(isTabbable);
  }

  function syncScrollLock() {
    document.body.classList.toggle('modal-open', modals.some(function (m) { return m.classList.contains('open'); }));
  }

  function openModal(modal, trigger) {
    if (trigger && !trigger.closest('.modal')) lastFocused = trigger;
    modal.classList.add('open');
    syncScrollLock();
    var target = modal.querySelector('.modal-close') || modal;
    target.focus({ preventScroll: true });
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    syncScrollLock();
    if (modals.some(function (m) { return m.classList.contains('open'); })) return;
    if (lastFocused && document.contains(lastFocused) && isTabbable(lastFocused)) {
      lastFocused.focus({ preventScroll: true });
    }
    lastFocused = null;
  }

  /* ---------- Progress helper ---------- */
  function makeProgress(rootId, fillId, labelId) {
    var root = $(rootId), fill = $(fillId), label = $(labelId);
    var timer = null, tick = 0, val = 0;
    return {
      show: function () {
        if (!root) return;
        val = 0; tick = 0;
        root.classList.add('active');
        fill.style.width = '0%';
        label.textContent = '0%';
        if (timer) clearInterval(timer);
        timer = setInterval(function () {
          tick++;
          if (val < 90) {
            var step = Math.max(1, Math.ceil((90 - val) * 0.12 * (1 + Math.sin(tick * 0.5))));
            val = Math.min(90, val + step);
          } else {
            val = Math.min(99, val + 1);
          }
          fill.style.width = val + '%';
          label.textContent = Math.round(val) + '%';
        }, 90);
      },
      hide: function () {
        if (timer) clearInterval(timer);
        timer = null;
        if (!root) return;
        fill.style.width = '100%';
        label.textContent = '100%';
        setTimeout(function () { root.classList.remove('active'); }, 250);
      },
    };
  }

  function formatMeta(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var locale = document.documentElement.lang === 'id' ? 'id-ID' : 'en-US';
    var when = new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(date);
    return localized('schedule.updated') + ' ' + when;
  }

  /* Stable r.jina.ai URLs only: unique cache-busting queries get the domain
     blocked by r.jina.ai's abuse limiter. */

  /* ---------- Training (accordion) ---------- */
  var trainingFaq, trainingSearchInput, trainingSearchClear, trainingMeta;
  var trainingProgress;
  var trainingGroupsData = [];
  var trainingLastGood = null;
  var trainingUpdated = null;

  function parseNotionTraining(text) {
    var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); });
    var groups = [];
    var mdLink = new RegExp('\\[([^\\]]*)\\]\\(([^)]+)\\)');

    var i = 0;
    for (; i < lines.length; i++) {
      if (lines[i].toLowerCase().indexOf('markdown content:') !== -1) { i++; break; }
    }
    for (; i < lines.length; i++) {
      var low = lines[i].replace(/^#{1,6}\s*/, '').trim().toLowerCase();
      if (low === 'isi tabel' || low === '—' || low === '-' || /^#{1,6}\s*$/.test(lines[i])) { i++; break; }
    }

    var labelOf = function (text) {
      var l = text.toLowerCase();
      if (/\[\S+\]\([^)]+\)/.test(l) || /^https?:\/\//.test(l)) return null;
      if (l === 'judul' || l === 'kurikulum' || l === 'durasi' || l === 'biaya') return l;
      if (l === 'durasi training') return 'durasi';
      if (l === 'biaya investasi') return 'biaya';
      if (l === 'link registrasi' || l === 'registrasi') return 'registrasi';
      if (l.indexOf('kurikulum') !== -1) return 'kurikulum';
      if (l.indexOf('durasi') !== -1) return 'durasi';
      if (l.indexOf('biaya') !== -1) return 'biaya';
      if (l.indexOf('judul') !== -1) return 'judul';
      if (l.indexOf('registrasi') !== -1) return 'registrasi';
      return null;
    };

    var cur = null, section = null, module = null;
    var startGroup = function (id) {
      if (cur && cur.title) groups.push(cur);
      cur = { id: id || '', title: '', modules: [], durasi: '', biaya: '', registrasi: '' };
      section = 'judul';
      module = null;
    };
    var flushModule = function () {
      if (cur && module && module.name) cur.modules.push(module);
      module = null;
    };

    for (; i < lines.length; i++) {
      var l = lines[i];
      if (!l) continue;
      var clean = l.replace(/^#{1,6}\s*/, '').trim();
      var label = labelOf(clean);
      var numMark = clean.match(/^(\d{3})\s*$/);

      if (numMark) {
        if (!cur || (cur.title && cur.biaya)) startGroup(numMark[1]);
        else if (!cur.id) cur.id = numMark[1];
        continue;
      }
      if (label) {
        if (section === 'kurikulum') flushModule();
        if (label === 'judul' || label === 'kurikulum') {
          if (cur && cur.biaya) startGroup('');
        } else if (label !== 'registrasi') {
          if (cur && cur.biaya) startGroup('');
        }
        section = label;
        module = null;
        continue;
      }
      if (!cur) startGroup('');
      if (section === 'judul') {
        if (!cur.title) cur.title = l;
        section = null;
      } else if (section === 'kurikulum') {
        if (/^module\b/i.test(l) || /^mod\b/i.test(l) || /^day\b/i.test(l)) {
          flushModule();
          module = { name: l, items: [] };
        } else if (module) {
          module.items.push(l);
        }
      } else if (section === 'durasi') {
        cur.durasi = (cur.durasi ? cur.durasi + '\n' : '') + l;
      } else if (section === 'biaya') {
        cur.biaya = (cur.biaya ? cur.biaya + '\n' : '') + l;
      } else if (section === 'registrasi') {
        var val = l.replace(/^[-*+]\s+/, '');
        var m = val.match(mdLink);
        var link = m ? (m[2] || '') : val;
        if (!cur.registrasi) cur.registrasi = link;
      }
    }
    flushModule();
    if (cur && cur.title) groups.push(cur);
    groups.forEach(function (g, k) {
      if (!g.title.trim()) g.title = localized('training.defaultTitle') + ' ' + (k + 1);
      if (!g.id) g.id = String(k + 1).padStart(3, '0');
    });
    return groups;
  }

  function renderTraining(groups) {
    trainingGroupsData = groups || [];
    if (trainingMeta) trainingMeta.textContent = trainingUpdated ? formatMeta(trainingUpdated) : '';
    if (!trainingFaq) return;
    trainingFaq.textContent = '';

    if (!trainingGroupsData.length) {
      var empty = document.createElement('p');
      empty.className = 'training-faq-empty';
      empty.textContent = localized('training.none');
      trainingFaq.appendChild(empty);
      return;
    }

    trainingGroupsData.forEach(function (g, k) {
      var item = document.createElement('div');
      item.className = 'faq-item training-faq-item';

      var btn = document.createElement('button');
      btn.className = 'faq-question';
      btn.type = 'button';
      btn.id = 'training-panel-btn-' + k;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'training-panel-' + k);

      var label = document.createElement('span');
      label.textContent = g.title;
      var icon = document.createElement('span');
      icon.className = 'faq-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '+';
      btn.appendChild(label);
      btn.appendChild(icon);

      var panel = document.createElement('div');
      panel.className = 'training-faq-answer';
      panel.id = 'training-panel-' + k;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', 'training-panel-btn-' + k);

      var inner = document.createElement('div');
      inner.className = 'training-faq-inner';

      if (g.modules && g.modules.length) {
        var labelCur = document.createElement('h5');
        labelCur.className = 'training-faq-label';
        labelCur.textContent = localized('training.curriculum');
        inner.appendChild(labelCur);
        g.modules.forEach(function (m) {
          var moduleEl = document.createElement('div');
          moduleEl.className = 'training-faq-module';
          var nameEl = document.createElement('strong');
          nameEl.textContent = m.name || '';
          moduleEl.appendChild(nameEl);
          var items = (m.items || []).filter(Boolean);
          if (items.length) {
            var ul = document.createElement('ul');
            items.forEach(function (it) {
              var li = document.createElement('li');
              li.textContent = it;
              ul.appendChild(li);
            });
            moduleEl.appendChild(ul);
          }
          inner.appendChild(moduleEl);
        });
      }

      if (g.durasi) {
        var dur = document.createElement('p');
        dur.className = 'training-faq-info';
        var durLabel = document.createElement('strong');
        durLabel.textContent = localized('training.duration');
        var durText = document.createElement('span');
        durText.textContent = g.durasi;
        dur.appendChild(durLabel);
        dur.appendChild(durText);
        inner.appendChild(dur);
      }

      if (g.biaya) {
        var cost = document.createElement('p');
        cost.className = 'training-faq-info';
        var costLabel = document.createElement('strong');
        costLabel.textContent = localized('training.investment');
        var costText = document.createElement('span');
        costText.textContent = g.biaya;
        cost.appendChild(costLabel);
        cost.appendChild(costText);
        inner.appendChild(cost);
      }

      var reg = document.createElement('a');
      reg.className = 'training-faq-register';
      reg.href = safeUrl(g.registrasi) || DEFAULT_REGISTER;
      reg.setAttribute('target', '_blank');
      reg.setAttribute('rel', 'noopener');
      reg.textContent = localized('training.register');
      inner.appendChild(reg);

      panel.appendChild(inner);
      item.appendChild(btn);
      item.appendChild(panel);
      trainingFaq.appendChild(item);
    });

    applyTrainingSearch();
  }

  function applyTrainingSearch() {
    if (!trainingSearchInput || !trainingFaq) return;
    var q = trainingSearchInput.value.trim().toLowerCase();
    if (trainingSearchClear) trainingSearchClear.style.display = q ? 'flex' : 'none';

    var items = Array.prototype.slice.call(trainingFaq.querySelectorAll('.training-faq-item'));
    if (!items.length) return;
    var visible = 0;

    items.forEach(function (item, k) {
      var g = trainingGroupsData[k];
      var hay = [
        g ? g.title : '',
        (g && g.modules || []).map(function (m) { return m.name + ' ' + (m.items || []).join(' '); }).join(' '),
        g ? g.durasi : '',
        g ? g.biaya : '',
        g ? g.registrasi : '',
      ].join(' ').toLowerCase();
      var match = !q || hay.indexOf(q) !== -1;
      item.style.display = match ? '' : 'none';
      var btn = item.querySelector('.faq-question');
      if (q && match) {
        if (!item.classList.contains('open')) {
          item.classList.add('open');
          if (btn) btn.setAttribute('aria-expanded', 'true');
        }
        visible++;
      } else if (!q && item.classList.contains('open')) {
        item.classList.remove('open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });

    var emptyEl = trainingFaq.querySelector('.training-faq-empty');
    if (q && visible === 0) {
      if (!emptyEl) {
        emptyEl = document.createElement('p');
        emptyEl.className = 'training-faq-empty';
        trainingFaq.appendChild(emptyEl);
      }
      emptyEl.textContent = localized('training.searchEmpty');
    } else if (emptyEl) {
      emptyEl.remove();
    }
  }

  async function fetchTraining() {
    /* Training popup is now an embedded Google Sheet, so skip Notion fetch. */
    if (!trainingFaq) return;
    trainingProgress.show();
    trainingUpdated = new Date().toISOString();
    var groups = [];
    /* 1) LIVE Notion page API first. */
    try {
      var lines = await notionApiLines(TRAINING_PAGE_ID);
      groups = lines.length ? parseNotionTraining('Markdown Content:\n' + lines.join('\n')) : [];
    } catch (e) { groups = []; }
    /* 2) r.jina.ai proxy fallback. */
    if (!groups.length) {
      try {
        var res = await fetch(TRAINING_URL, { cache: 'no-store' });
        if (res.ok) groups = parseNotionTraining(await res.text());
      } catch (e) { /* ignore */ }
    }
    if (groups.length) {
      trainingLastGood = groups;
      renderTraining(groups);
    } else {
      renderTraining(trainingLastGood || TRAINING_INLINE);
    }
    trainingProgress.hide();
  }

  /* ---------- Schedule (table) ---------- */
  var jadwalHead, jadwalRows, jadwalMeta, jadwalSearchInput, jadwalSearchClear;
  var jadwalProgress;
  var jadwalRowsData = [];
  var jadwalMetaUpdated = null;

  function normalizeSchedule(data) {
    var headers = (data.columns || []).map(function (h) { return String(h).trim(); });
    var entries = (data.rows || []).map(function (row) {
      return headers.map(function (h, ci) {
        var cell = row[ci] || { v: '' };
        return { v: String(cell.v || ''), link: cell.link || null };
      });
    });
    return { headers: headers, entries: entries, updated: data.updated };
  }

  function parseNotionMarkdown(text) {
    var KEYS = ['tanggal', 'training', 'materi', 'waktu', 'lokasi', 'biaya', 'registrasi'];
    var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); });
    var start = lines.findIndex(function (l) { return l.trim().toLowerCase() === 'isi tabel'; });
    var entries = [];
    var mdLink = new RegExp('\\[([^\\]]*)\\]\\(([^)]+)\\)');
    var row = new Map();
    var currentKey = null;

    var flush = function () {
      if (!row.size) return;
      var cells = JADWAL_COLUMNS.map(function (name) { return row.get(name.toLowerCase()) || { v: '', link: null }; });
      entries.push(cells);
      row = new Map();
    };

    for (var i = (start === -1 ? 0 : start + 1); i < lines.length; i++) {
      var l = lines[i];
      if (!l) continue;
      if (/^#{1,6}\s*[0-9]{1,6}\s*$/.test(l) || /^[0-9]{3}$/.test(l)) continue;
      var low = l.toLowerCase();
      if (KEYS.indexOf(low) !== -1) {
        if (row.has(low)) flush();
        currentKey = low;
      } else {
        var m = l.match(mdLink);
        var value = m ? m[1] : l;
        var link = m ? m[2] : (/^https?:\/\//i.test(l) ? l : null);
        if (!currentKey) continue;
        var existing = row.get(currentKey);
        if (existing) {
          existing.v += '\n' + value;
          if (link) existing.link = link;
        } else {
          row.set(currentKey, { v: value, link: link });
        }
      }
    }
    flush();
    return { headers: JADWAL_COLUMNS, entries: entries, updated: new Date().toISOString() };
  }

  function renderSchedule(headers, entries, updated) {
    var columns = JADWAL_COLUMNS.map(function (name) {
      var idx = headers.findIndex(function (h) { return h.trim().toLowerCase() === name.toLowerCase(); });
      return idx === -1 ? null : idx;
    });
    var present = columns.filter(function (idx) { return idx !== null; });

    var headRow = document.createElement('tr');
    present.forEach(function (idx) {
      var th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = headers[idx].trim();
      headRow.appendChild(th);
    });
    jadwalHead.replaceChildren(headRow);

    jadwalRowsData = entries
      .filter(function (cells) { return cells.some(function (cell) { return cell && cell.v !== ''; }); })
      .map(function (cells) { return present.map(function (idx) { return cells[idx] || { v: '', link: null }; }); });
    jadwalMetaUpdated = updated;

    applyScheduleFilter();
  }

  function applyScheduleFilter() {
    var q = (jadwalSearchInput.value || '').trim().toLowerCase();
    jadwalSearchClear.style.display = q ? 'flex' : 'none';

    var visible = q
      ? jadwalRowsData.filter(function (cells) {
          return cells.some(function (cell) { return cell && cell.v.toLowerCase().indexOf(q) !== -1; });
        })
      : jadwalRowsData;

    jadwalRows.textContent = '';

    if (!visible.length) {
      if (q) {
        var tr = document.createElement('tr');
        tr.className = 'jadwal-status';
        var td = document.createElement('td');
        td.setAttribute('colspan', String(JADWAL_COLUMNS.length));
        td.textContent = localized('schedule.searchEmpty');
        tr.appendChild(td);
        jadwalRows.appendChild(tr);
      }
      jadwalMeta.textContent = jadwalMetaUpdated ? formatMeta(jadwalMetaUpdated) : '';
      return;
    }

    visible.forEach(function (cells) {
      var tr = document.createElement('tr');
      cells.forEach(function (cell) {
        var td = document.createElement('td');
        var href = cell.link ? safeUrl(cell.link) : null;
        if (href) {
          var a = document.createElement('a');
          a.className = 'jadwal-register';
          a.href = href;
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
          a.textContent = localized('schedule.register');
          td.appendChild(a);
        } else if (cell.v.indexOf('\n') !== -1) {
          td.classList.add('jadwal-multi');
          td.textContent = cell.v;
        } else {
          td.textContent = cell.v;
        }
        tr.appendChild(td);
      });
      jadwalRows.appendChild(tr);
    });

    jadwalMeta.textContent = jadwalMetaUpdated ? formatMeta(jadwalMetaUpdated) : '';
  }

  async function fetchSchedule() {
    jadwalProgress.show();
    var fallback = normalizeSchedule(SCHEDULE_INLINE);
    var data = null;

    /* 1) LIVE Notion page API first (CORS-enabled). */
    try {
      var lines = await notionApiLines(JADWAL_PAGE_ID);
      data = lines.length ? parseNotionMarkdown(lines.join('\n')) : null;
    } catch (e) { data = null; }

    /* 2) r.jina.ai proxy fallback. */
    if (!(data && data.entries && data.entries.length)) {
      try {
        var r = await fetch(JADWAL_URL, { cache: 'no-store' });
        if (r.ok) data = parseNotionMarkdown(await r.text());
      } catch (e) { /* ignore */ }
    }

    /* 3) schedule.json snapshot fallback. */
    if (!(data && data.entries && data.entries.length)) {
      try {
        var r2 = await fetch(SCHEDULE_JSON + '?t=' + Date.now(), { cache: 'no-store' });
        if (r2.ok) data = normalizeSchedule(await r2.json());
      } catch (e) { /* ignore */ }
    }

    var stamp = new Date().toISOString();
    if (data && data.entries && data.entries.length) {
      renderSchedule(data.headers, data.entries, data.updated || stamp);
    } else {
      renderSchedule(fallback.headers, fallback.entries, stamp);
    }
    jadwalProgress.hide();
  }

  /* ---------- Chrome / language ---------- */
  function refreshChrome() {
    document.querySelectorAll('[data-modal-title]').forEach(function (el) {
      el.textContent = localized(el.getAttribute('data-modal-title'));
    });
    if (trainingSearchInput) trainingSearchInput.placeholder = localized('training.searchPlaceholder');
    if (jadwalSearchInput) jadwalSearchInput.placeholder = localized('schedule.searchPlaceholder');
    if (trainingMeta && trainingUpdated) trainingMeta.textContent = formatMeta(trainingUpdated);
    if (jadwalMeta && jadwalMetaUpdated) jadwalMeta.textContent = formatMeta(jadwalMetaUpdated);
  }

  /* ---------- Init ---------- */
  function init() {
    injectModals();

    trainingFaq = $('training-faq');
    trainingSearchInput = $('training-search-input');
    trainingSearchClear = $('training-search-clear');
    trainingMeta = $('training-meta');
    trainingProgress = makeProgress('training-progress', 'training-progress-fill', 'training-progress-label');

    jadwalHead = $('sched-head');
    jadwalRows = $('sched-rows');
    jadwalMeta = $('sched-meta');
    jadwalSearchInput = $('sched-search-input');
    jadwalSearchClear = $('sched-search-clear');
    jadwalProgress = makeProgress('sched-progress', 'sched-progress-fill', 'sched-progress-label');

    modals = Array.prototype.slice.call(document.querySelectorAll('.modal'));

    refreshChrome();

    /* Open + refresh on click. */
    var wiring = [
      ['training-modal', 'training-open', 'training-modal-close', 'training-modal-backdrop'],
      ['jadwal-modal', 'jadwal-open', 'jadwal-modal-close', 'jadwal-modal-backdrop'],
    ];
    wiring.forEach(function (spec) {
      var modal = $(spec[0]);
      if (!modal) return;
      var opener = $(spec[1]);
      var closer = $(spec[2]);
      var backdrop = $(spec[3]);
      if (opener) opener.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(modal, opener);
        if (spec[0] === 'training-modal') {
          trainingFaq.textContent = '';
          trainingSearchInput.value = '';
          trainingSearchClear.style.display = 'none';
          if (trainingMeta) trainingMeta.textContent = '';
          fetchTraining();
        } else {
          jadwalRows.textContent = '';
          jadwalHead.textContent = '';
          jadwalMeta.textContent = '';
          jadwalSearchInput.value = '';
          fetchSchedule();
        }
      });
      if (closer) closer.addEventListener('click', function () { closeModal(modal); });
      if (backdrop) backdrop.addEventListener('click', function () { closeModal(modal); });
    });

    /* Escape closes topmost; Tab trapped. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;
      var open = modals.filter(function (m) { return m.classList.contains('open'); });
      if (!open.length) return;
      var modal = open[open.length - 1];
      if (e.key === 'Escape') { e.preventDefault(); closeModal(modal); return; }
      var items = focusablesIn(modal);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* Accordion open/close (one at a time). */
    if (trainingFaq) {
      trainingFaq.addEventListener('click', function (e) {
        var btn = e.target.closest('.faq-question');
        if (!btn || !trainingFaq.contains(btn)) return;
        var item = btn.closest('.training-faq-item');
        if (!item) return;
        var willOpen = !item.classList.contains('open');
        trainingFaq.querySelectorAll('.training-faq-item.open').forEach(function (i) { i.classList.remove('open'); });
        item.classList.toggle('open', willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    }

    /* Search inputs. */
    if (trainingSearchInput) {
      trainingSearchInput.addEventListener('input', applyTrainingSearch);
      trainingSearchInput.addEventListener('search', applyTrainingSearch);
    }
    if (trainingSearchClear) {
      trainingSearchClear.addEventListener('click', function () {
        trainingSearchInput.value = '';
        applyTrainingSearch();
        trainingSearchInput.focus({ preventScroll: true });
      });
    }
    if (jadwalSearchInput) {
      jadwalSearchInput.addEventListener('input', applyScheduleFilter);
      jadwalSearchInput.addEventListener('search', applyScheduleFilter);
    }
    if (jadwalSearchClear) {
      jadwalSearchClear.addEventListener('click', function () {
        jadwalSearchInput.value = '';
        applyScheduleFilter();
        jadwalSearchInput.focus({ preventScroll: true });
      });
    }

    /* Re-localise modal chrome when the page language changes. */
    var lastLang = document.documentElement.lang;
    new MutationObserver(function () {
      if (document.documentElement.lang === lastLang) return;
      lastLang = document.documentElement.lang;
      refreshChrome();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    /* Warm the data. */
    fetchTraining();
    fetchSchedule();
    setInterval(fetchTraining, REFRESH_MS);
    setInterval(fetchSchedule, REFRESH_MS);

    /* Re-check whichever popup is open when the tab is focused again. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      var t = $('training-modal');
      var j = $('jadwal-modal');
      if (t && t.classList.contains('open')) fetchTraining();
      if (j && j.classList.contains('open')) fetchSchedule();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
