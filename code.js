// PDF Links – main thread (runs in Figma's sandbox with access to the document)
const KEY = 'pdfLink';

figma.showUI(__html__, { width: 320, height: 440, themeColors: true });

// Add a scheme when the user omits it: plain emails become mailto:, everything else https://
function normalizeUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return '';
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return 'mailto:' + url;
  return 'https://' + url;
}

function linkedNodesOnPage() {
  return figma.currentPage.findAll(n => !!n.getPluginData(KEY));
}

// Push the current selection and the list of linked nodes to the UI
function sendState() {
  const sel = figma.currentPage.selection;
  const links = [...new Set(sel.map(n => n.getPluginData(KEY)))];
  figma.ui.postMessage({
    type: 'state',
    selectionCount: sel.length,
    currentLink: links.length === 1 ? links[0] : (links.length > 1 ? '(multiple links)' : ''),
    linked: linkedNodesOnPage().map(n => ({ id: n.id, name: n.name, url: n.getPluginData(KEY) })),
  });
}

// Frames to export: selected top-level nodes, or every top-level frame on the page
function framesToExport() {
  const exportable = n =>
    ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION', 'GROUP'].includes(n.type) && n.visible;
  const sel = figma.currentPage.selection.filter(n => n.parent && n.parent.type === 'PAGE');
  const source = sel.length ? sel : figma.currentPage.children;
  return source.filter(exportable);
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

async function exportPdf() {
  const frames = framesToExport();
  if (!frames.length) {
    figma.notify('Nothing to export – select a frame or add one to the page.');
    figma.ui.postMessage({ type: 'export-done' });
    return;
  }

  const pages = [];
  for (const frame of frames) {
    const bytes = await frame.exportAsync({ format: 'PDF' });
    // The PDF covers the render bounds (including e.g. drop shadows), so measure from there
    const origin = frame.absoluteRenderBounds || frame.absoluteBoundingBox;

    const candidates = [frame, ...(frame.findAll ? frame.findAll(n => !!n.getPluginData(KEY)) : [])];
    const links = [];
    for (const n of candidates) {
      const url = n.getPluginData(KEY);
      if (!url || !isActuallyVisible(n, frame)) continue;
      const b = n.absoluteBoundingBox;
      if (!b) continue;
      // Link rectangle relative to the top-left corner of the exported page
      links.push({ url, x: b.x - origin.x, y: b.y - origin.y, w: b.width, h: b.height });
    }
    pages.push({ name: frame.name, bytes, width: origin.width, height: origin.height, links });
  }

  const fileName = (frames.length === 1 ? frames[0].name : figma.root.name) || 'export';
  // The UI iframe merges the pages and adds link annotations (pdf-lib runs there)
  figma.ui.postMessage({ type: 'build-pdf', pages, fileName });
}

figma.on('selectionchange', sendState);
figma.on('currentpagechange', sendState);

figma.ui.onmessage = async msg => {
  if (msg.type === 'set-link') {
    const url = normalizeUrl(msg.url);
    const sel = figma.currentPage.selection;
    if (!sel.length) return figma.notify('Select an element first.');
    if (!url) return figma.notify('Enter a link URL.');
    sel.forEach(n => n.setPluginData(KEY, url));
    figma.notify(`Link set on ${sel.length} element${sel.length > 1 ? 's' : ''}.`);
    sendState();
  }

  if (msg.type === 'remove-link') {
    figma.currentPage.selection.forEach(n => n.setPluginData(KEY, ''));
    figma.notify('Link removed.');
    sendState();
  }

  if (msg.type === 'select-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
  }

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

sendState();
