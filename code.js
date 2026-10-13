// PDF Links – main thread (runs in Figma's sandbox with access to the document)
// Data is stored as shared plugin data under a fixed namespace, so links survive a change of the
// plugin ID (e.g. when published) and are visible to everyone using any copy of the plugin.
const NS = 'pdflinks';
const KEY = 'pdfLink';      // per node: a URL, "#<node id>" for a link to a frame in the PDF, or SKIP
const SKIP = '-';           // layer has a prototype link that should not become a PDF link
const TITLE_KEY = 'pdfTitle'; // per document: PDF title
const SETTINGS_KEY = 'settings'; // per user (clientStorage)

const getLink = node => node.getSharedPluginData(NS, KEY);
const setLink = (node, value) => node.setSharedPluginData(NS, KEY, value);

// Older versions stored data with setPluginData (tied to the plugin ID) – move it to shared data
function migrateLegacyData() {
  for (const n of figma.currentPage.findAll(n => !!n.getPluginData(KEY))) {
    if (!getLink(n)) setLink(n, n.getPluginData(KEY));
    n.setPluginData(KEY, '');
  }
  const title = figma.root.getPluginData(TITLE_KEY);
  if (title) {
    if (!figma.root.getSharedPluginData(NS, TITLE_KEY)) figma.root.setSharedPluginData(NS, TITLE_KEY, title);
    figma.root.setPluginData(TITLE_KEY, '');
  }
}

const DEFAULT_SETTINGS = { usePrototype: true, bookmarks: true, order: 'rows', author: '' };
let settings = Object.assign({}, DEFAULT_SETTINGS);

figma.showUI(__html__, { width: 360, height: 600, themeColors: true });

// Add a scheme when the user omits it: plain emails become mailto:, everything else https://
function normalizeUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return '';
  if (/^(https?:|mailto:|tel:)/i.test(url) || /^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return 'mailto:' + url;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(url);
  if (!isIp && /^\+?[\d\s().-]{6,}$/.test(url)) return 'tel:' + url.replace(/[^\d+]/g, '');
  return 'https://' + url;
}

// Link taken from the node's prototype "On click" interaction:
// "Open link" gives { url }, "Navigate to" / "Scroll to" gives { destId }
function prototypeLink(node) {
  if (!('reactions' in node)) return null;
  for (const r of node.reactions) {
    if (!r.trigger || r.trigger.type !== 'ON_CLICK') continue;
    for (const a of r.actions || (r.action ? [r.action] : [])) {
      if (a && a.type === 'URL' && a.url) return { url: normalizeUrl(a.url) };
      if (a && a.type === 'NODE' && a.destinationId &&
          (a.navigation === 'NAVIGATE' || a.navigation === 'SCROLL_TO')) {
        return { destId: a.destinationId };
      }
    }
  }
  return null;
}

// A link set in the plugin wins over the prototype interaction on the same node
function linkFor(node, usePrototype) {
  const value = getLink(node);
  if (value === SKIP) return null;
  if (value) {
    return value[0] === '#'
      ? { destId: value.slice(1), source: 'plugin' }
      : { url: value, source: 'plugin' };
  }
  const proto = usePrototype ? prototypeLink(node) : null;
  return proto && Object.assign(proto, { source: 'prototype' });
}

function isExportable(n) {
  return ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION', 'GROUP'].includes(n.type) && n.visible;
}

// The top-level node (direct child of the page) that contains the node
function topLevel(node) {
  let n = node;
  while (n.parent && n.parent.type !== 'PAGE') n = n.parent;
  return n;
}

// Reading order: group nodes into rows (or columns) by position, then sort inside each
function readingOrder(nodes, byColumns) {
  const [main, cross, size] = byColumns ? ['x', 'y', 'width'] : ['y', 'x', 'height'];
  const items = nodes
    .map(n => ({ n, b: n.absoluteBoundingBox }))
    .sort((a, b) => a.b[main] - b.b[main] || a.b[cross] - b.b[cross]);
  const lines = [];
  for (const it of items) {
    const line = lines[lines.length - 1];
    // Same row when the node starts above the middle of the row's first node
    if (line && it.b[main] < line.start + line.size / 2) line.items.push(it);
    else lines.push({ start: it.b[main], size: it.b[size], items: [it] });
  }
  return lines.flatMap(l => l.items.sort((a, b) => a.b[cross] - b.b[cross])).map(it => it.n);
}

function sortFrames(frames) {
  if (settings.order === 'layers') {
    // Same order as the layers panel (top first); page.children is bottom first
    const children = figma.currentPage.children;
    return frames.slice().sort((a, b) => children.indexOf(b) - children.indexOf(a));
  }
  return readingOrder(frames, settings.order === 'columns');
}

// Frames to export: selected top-level nodes, or every top-level frame on the page
function framesToExport() {
  const sel = figma.currentPage.selection.filter(n => n.parent && n.parent.type === 'PAGE');
  const source = sel.length ? sel : figma.currentPage.children;
  return sortFrames(source.filter(isExportable));
}

// A node is only rendered if it and all its ancestors (up to the exported frame) are visible
function isActuallyVisible(node, root) {
  let n = node;
  while (n && n !== root.parent) {
    if (!n.visible) return false;
    n = n.parent;
  }
  return true;
}

// The PDF covers the render bounds (including e.g. drop shadows), so measure from there
function pageOrigin(frame) {
  return frame.absoluteRenderBounds || frame.absoluteBoundingBox;
}

// Problems that make a link not work (or not appear) in the exported PDF
async function linkIssues(node, link, exportIds) {
  const issues = [];
  const top = topLevel(node);
  if (!isExportable(top) && top.visible) issues.push('not inside a frame – not exported');
  if (!isActuallyVisible(node, top)) issues.push('hidden – not exported');

  const b = node.absoluteBoundingBox;
  const page = pageOrigin(top);
  if (node !== top && b && page) {
    const ix = Math.min(b.x + b.width, page.x + page.width) - Math.max(b.x, page.x);
    const iy = Math.min(b.y + b.height, page.y + page.height) - Math.max(b.y, page.y);
    if (ix <= 0 || iy <= 0) issues.push('outside its frame – not clickable');
    else if (ix < b.width - 0.5 || iy < b.height - 0.5) issues.push('partly outside its frame');
  }

  if (link.destId) {
    const dest = await figma.getNodeByIdAsync(link.destId);
    if (!dest) issues.push('target frame was deleted');
    else {
      const destTop = topLevel(dest);
      if (destTop.parent !== figma.currentPage) issues.push('target is on another page');
      else if (!exportIds.has(destTop.id)) issues.push(`target “${destTop.name}” is not in the export`);
    }
  }
  return issues;
}

// Push the current selection, the frames and the list of linked nodes to the UI.
// Calls can overlap (selection changes quickly while this awaits), so only the newest one posts.
let stateSeq = 0;
async function sendState() {
  const seq = ++stateSeq;
  const sel = figma.currentPage.selection;
  const values = [...new Set(sel.map(getLink))];
  const exportIds = new Set(framesToExport().map(f => f.id));

  const linked = [];
  for (const n of figma.currentPage.findAll(n => !!linkFor(n, settings.usePrototype))) {
    const link = linkFor(n, settings.usePrototype);
    let label = link.url;
    if (link.destId) {
      const dest = await figma.getNodeByIdAsync(link.destId);
      label = '→ ' + (dest ? dest.name : 'missing frame');
    }
    linked.push({
      id: n.id, name: n.name, url: label,
      prototype: link.source === 'prototype',
      issues: await linkIssues(n, link, exportIds),
    });
  }

  // Prototype interaction on a single selected layer, shown so the user knows it already links somewhere
  let selectionPrototype = '';
  const proto = settings.usePrototype && sel.length === 1 &&
    (!values[0] || values[0] === SKIP) && prototypeLink(sel[0]);
  if (proto) {
    const dest = proto.destId && await figma.getNodeByIdAsync(proto.destId);
    selectionPrototype = proto.url || (dest ? dest.name : 'missing frame');
  }

  if (seq !== stateSeq) return; // a newer call has started – its result is more current
  figma.ui.postMessage({
    type: 'state',
    selectionCount: sel.length,
    selectionIds: sel.map(n => n.id).join(','),
    selectionName: sel.length === 1 ? sel[0].name : '',
    selectionTopId: sel.length === 1 ? topLevel(sel[0]).id : '',
    multipleLinks: values.length > 1,
    currentLink: values.length === 1 ? values[0] : '',
    selectionPrototype,
    frames: sortFrames(figma.currentPage.children.filter(isExportable)).map(f => ({ id: f.id, name: f.name })),
    exportCount: exportIds.size,
    exportsAll: !figma.currentPage.selection.some(n => n.parent && n.parent.type === 'PAGE' && isExportable(n)),
    linked,
  });
}

async function exportPdf() {
  const frames = framesToExport();
  if (!frames.length) {
    figma.notify('Nothing to export – select a frame or add one to the page.');
    figma.ui.postMessage({ type: 'export-done' });
    return;
  }

  const pageOf = new Map(frames.map((f, i) => [f.id, i]));

  // Turn a link destination into a PDF page index and a vertical offset on that page.
  // Returns null when the destination is not part of this export.
  async function resolveDest(destId) {
    const dest = await figma.getNodeByIdAsync(destId);
    if (!dest || dest.type === 'PAGE' || dest.type === 'DOCUMENT') return null;
    const top = topLevel(dest);
    if (!pageOf.has(top.id)) return null;
    const b = dest.absoluteBoundingBox;
    const y = dest === top || !b ? 0 : Math.max(0, b.y - pageOrigin(top).y);
    return { page: pageOf.get(top.id), y };
  }

  const pages = [];
  let skipped = 0;
  for (const frame of frames) {
    const bytes = await frame.exportAsync({ format: 'PDF' });
    const origin = pageOrigin(frame);
    const has = n => !!linkFor(n, settings.usePrototype);

    const candidates = [frame, ...(frame.findAll ? frame.findAll(has) : [])];
    const links = [];
    for (const n of candidates) {
      const link = linkFor(n, settings.usePrototype);
      if (!link || !isActuallyVisible(n, frame)) continue;
      const b = n.absoluteBoundingBox;
      if (!b) continue;
      // Link rectangle relative to the top-left corner of the exported page
      const rect = { x: b.x - origin.x, y: b.y - origin.y, w: b.width, h: b.height };
      if (link.url) {
        links.push(Object.assign(rect, { url: link.url }));
      } else {
        const dest = await resolveDest(link.destId);
        if (dest) links.push(Object.assign(rect, { dest }));
        else skipped++;
      }
    }
    pages.push({ name: frame.name, bytes, width: origin.width, height: origin.height, links });
  }

  const fileName = (frames.length === 1 ? frames[0].name : figma.root.name) || 'export';
  // The UI iframe merges the pages and adds link annotations (pdf-lib runs there)
  figma.ui.postMessage({ type: 'build-pdf', pages, fileName, skipped });
}

// Make layers non-clickable in the PDF. A prototype interaction is left untouched in Figma –
// the layer is only marked to be skipped – so removing a link never breaks the prototype.
function removeLinks(nodes) {
  const before = nodes.map(n => [n, getLink(n)]);
  nodes.forEach(n => setLink(n, prototypeLink(n) ? SKIP : ''));
  const label = nodes.length === 1 ? `“${nodes[0].name}”` : `${nodes.length} layers`;
  figma.notify(`Link removed from ${label}.`, {
    timeout: 6000,
    button: {
      text: 'Undo',
      action: () => {
        before.forEach(([n, value]) => { if (!n.removed) setLink(n, value); });
        sendState();
      },
    },
  });
  sendState();
}

figma.on('selectionchange', sendState);
figma.on('currentpagechange', () => { migrateLegacyData(); sendState(); });

figma.ui.onmessage = async msg => {
  if (msg.type === 'set-link') {
    const sel = figma.currentPage.selection;
    if (!sel.length) return figma.notify('Select an element first.');
    const value = msg.destId ? '#' + msg.destId : normalizeUrl(msg.url);
    if (!value) return figma.notify(msg.destId === undefined ? 'Enter a link URL.' : 'Choose a frame.');
    sel.forEach(n => setLink(n, value));
    figma.notify(`Link set on ${sel.length} element${sel.length > 1 ? 's' : ''}.`);
    sendState();
  }

  if (msg.type === 'remove-link') {
    const nodes = msg.id ? [await figma.getNodeByIdAsync(msg.id)].filter(Boolean) : figma.currentPage.selection;
    if (nodes.length) removeLinks(nodes);
  }

  if (msg.type === 'restore-prototype') {
    figma.currentPage.selection.forEach(n => { if (getLink(n) === SKIP) setLink(n, ''); });
    figma.notify('The prototype click is used as a link again.');
    sendState();
  }

  if (msg.type === 'select-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
  }

  if (msg.type === 'save-settings') {
    settings = Object.assign({}, DEFAULT_SETTINGS, msg.settings);
    await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
    sendState();
  }

  if (msg.type === 'save-title') figma.root.setSharedPluginData(NS, TITLE_KEY, msg.title.trim());

  if (msg.type === 'export') {
    try {
      await exportPdf();
    } catch (e) {
      figma.notify('Export failed: ' + e.message, { error: true });
      figma.ui.postMessage({ type: 'export-done' });
    }
  }

  if (msg.type === 'notify') figma.notify(msg.text, { error: !!msg.error });
};

(async () => {
  migrateLegacyData();
  try {
    settings = Object.assign({}, DEFAULT_SETTINGS, await figma.clientStorage.getAsync(SETTINGS_KEY));
  } catch (e) { /* first run or storage unavailable – keep defaults */ }
  figma.ui.postMessage({
    type: 'settings',
    settings,
    title: figma.root.getSharedPluginData(NS, TITLE_KEY),
    defaultTitle: figma.root.name,
  });
  sendState();
})();
