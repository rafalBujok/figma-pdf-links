# PDF Links for Figma

**Add clickable links to any Figma layer — buttons, icons, shapes, frames — and export a PDF where those links actually work.**

Figma's built-in PDF export only keeps hyperlinks on text. Put a link on a button, a logo or a card and it's gone in the PDF. PDF Links fixes that: attach a URL to any element, export through the plugin, and the link becomes a clickable area in the PDF exactly where the element is.

Free, open source, no account, and no network access — your designs never leave Figma.

---

## Features

- **Links on any layer** – frames, groups, components, instances, shapes, vectors, images and text.
- **Prototype interactions become PDF links** – an *On click → Open link* interaction becomes a web link; *Navigate to* and *Scroll to* become internal links that jump to that frame's page in the PDF. No need to set the link twice.
- **Web, email and phone links** – `https://…`, `mailto:…`, `tel:…`. Type `example.com` and it becomes `https://example.com`; type an email and it becomes `mailto:`.
- **Links between pages** – link any layer to another frame; in the PDF it jumps to that frame's page.
- **Links are saved in the file** – they persist between sessions and travel with the Figma file.
- **Link overview** – see every linked layer on the current page, search it, and jump to a layer with one click.
- **Problem warnings** – the list flags links that won't work before you export: hidden layers, layers outside their frame, layers not inside any frame, and page links whose target frame is missing or not in the export.
- **Multi-frame export** – export selected frames (or every frame on the page) into a single PDF, one page per frame, in reading order (rows or columns of the canvas) or layers-panel order.
- **Bookmarks** – each frame becomes an entry in the PDF's bookmarks panel, named after the frame.
- **PDF title and author** – shown by PDF viewers instead of the file name; the title is saved in the Figma file, the author and other options are remembered for you.
- **Invisible link areas** – the PDF looks exactly like Figma's own export; links add no borders or visual changes.
- **Works offline** – the PDF library is bundled; the plugin declares no network access.

## How to use

1. Select one or more layers.
2. Choose what happens when the layer is clicked in the PDF:
   - **Open a website** – type a web address, email or phone number.
   - **Go to a page** – pick another frame; each frame is one page of the PDF.
3. Click **Save link** (or press Enter).
4. Select the frames you want in the PDF — or select nothing to export every frame on the page.
5. Optionally click the gear icon next to the export button to set the page order, bookmarks, title and author.
6. Click **Export … as PDF**. The PDF downloads automatically.

The **All links** tab lists every link on the current page and flags the ones that won't work; click a row to jump to the layer.

To remove a link, select the layer and click the trash icon – or hover over it in **All links** and click the trash icon there. Figma shows an **Undo** button for a few seconds. Removing a prototype link only skips it in the PDF; the interaction in your prototype stays untouched.

Layers with prototype *On click* interactions are picked up automatically and marked **prototype** in the link list. A link set in the plugin takes priority over the prototype interaction on the same layer. Untick **Use prototype clicks as links** in the export options to export only the links set in the plugin.

> **Important:** links work only in PDFs exported through the plugin. Figma's standard *Export → PDF* doesn't know about them.

## How it works

1. Each link is stored on its layer as shared plugin data (`setSharedPluginData` with the `pdflinks` namespace), so it lives inside the document, travels with the file and is visible to anyone who opens it with the plugin. Prototype links are read from the layer's `reactions` at export time.
2. On export, the plugin calls Figma's own `exportAsync({ format: 'PDF' })` for each frame, so the visual output is identical to a normal Figma export.
3. For every visible linked layer it computes the bounding box relative to the exported frame.
4. In the plugin UI, [pdf-lib](https://github.com/Hopding/pdf-lib) merges the pages and adds a standard PDF `/Link` annotation over each box – with a `/URI` action for web links, or a `/Dest` pointing at the target page for prototype navigation – converting from Figma's top-left coordinates to PDF's bottom-left coordinates.

Hidden layers (or layers inside hidden parents) are skipped, and link areas are clipped to the page.

## Installation

### From Figma Community

*Coming soon.*

### From source (development)

Requires [Node.js](https://nodejs.org/) and the Figma desktop app.

```bash
git clone https://github.com/rafalBujok/figma-pdf-links.git
cd figma-pdf-links
npm install
npm run build
```

In the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and select `manifest.json`.

## Project structure

```
manifest.json   Figma plugin manifest
code.js         Main thread: stores links, exports frames, computes link positions
src/ui.html     Plugin UI source: link editor, PDF merging and link annotations
build.mjs       Inlines pdf-lib into src/ui.html → ui.html
ui.html         Built UI loaded by Figma (generated – edit src/ui.html instead)
```

## Known limitations

- **Bounding-box links** – the clickable area is the layer's axis-aligned bounding box, so rotated or irregular shapes get a rectangular, slightly larger area.
- **Plugin export only** – links are not included in Figma's native PDF export.
- **Top-level export** – the plugin exports top-level frames, groups, sections, components and instances on the current page.
- **Page links need the target in the export** – a page link (set in the plugin or via *Navigate to*) is skipped when its destination frame is not one of the exported frames. Only *On click* triggers are used; overlays, swaps and *Back* are ignored.

## Contributing

1. Fork the repo and create a branch.
2. Edit `code.js` or `src/ui.html`, then run `npm run build`.
3. Test in the Figma desktop app and open a pull request.

Ideas and bug reports are welcome in [Issues](../../issues).

## License

[MIT](LICENSE)
