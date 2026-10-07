# PDF Links for Figma

**Add clickable links to any Figma layer — buttons, icons, shapes, frames — and export a PDF where those links actually work.**

Figma's built-in PDF export only keeps hyperlinks on text. Put a link on a button, a logo or a card and it's gone in the PDF. PDF Links fixes that: attach a URL to any element, export through the plugin, and the link becomes a clickable area in the PDF exactly where the element is.

Free, open source, no account, and no network access — your designs never leave Figma.

---

## Features

- **Links on any layer** – frames, groups, components, instances, shapes, vectors, images and text.
- **Web, email and phone links** – `https://…`, `mailto:…`, `tel:…`. Type `example.com` and it becomes `https://example.com`; type an email and it becomes `mailto:`.
- **Links are saved in the file** – they persist between sessions and travel with the Figma file.
- **Link overview** – see every linked layer on the current page and jump to it with one click.
- **Multi-frame export** – export selected frames (or every frame on the page) into a single PDF, one page per frame.
- **Invisible link areas** – the PDF looks exactly like Figma's own export; links add no borders or visual changes.
- **Works offline** – the PDF library is bundled; the plugin declares no network access.

## How to use

1. Select one or more layers.
2. Type a URL in the plugin and click **Set link** (or press Enter).
3. Select the frames you want in the PDF — or select nothing to export every frame on the page.
4. Click **Export PDF with links**. The PDF downloads automatically.

To remove a link, select the layer and click **Remove**.

> **Important:** links work only in PDFs exported through the plugin. Figma's standard *Export → PDF* doesn't know about them.

## How it works

1. Each link is stored on its layer with Figma's `setPluginData`, so it lives inside the document.
2. On export, the plugin calls Figma's own `exportAsync({ format: 'PDF' })` for each frame, so the visual output is identical to a normal Figma export.
3. For every visible linked layer it computes the bounding box relative to the exported frame.
4. In the plugin UI, [pdf-lib](https://github.com/Hopding/pdf-lib) merges the pages and adds a standard PDF `/Link` annotation with a `/URI` action over each box, converting from Figma's top-left coordinates to PDF's bottom-left coordinates.

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
- **External links only** – links to other pages inside the same PDF are not supported yet.

## Roadmap

- [ ] Internal links: jump to another page in the same PDF (table of contents, navigation buttons)
- [ ] Reuse existing prototype "Open link" interactions as PDF links
- [ ] Export across multiple Figma pages

Ideas and bug reports are welcome in [Issues](../../issues).

## Contributing

1. Fork the repo and create a branch.
2. Edit `code.js` or `src/ui.html`, then run `npm run build`.
3. Test in the Figma desktop app and open a pull request.

## License

[MIT](LICENSE)
