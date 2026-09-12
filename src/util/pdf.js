import { jsPDF } from "jspdf";

import "svg2pdf.js";

import { titleToFilename } from "@/util";

// Browser side "Download as PDF".
//
// The electron app gets its PDFs from Chromium's printToPDF, which the browser
// build has no access to. Every element except cards, charters and the tile
// manifest is rendered as SVG though, so those can be written out as a true
// vector PDF with jsPDF + svg2pdf: each printable SVG on the page becomes one
// PDF page sized exactly to the element, optionally with a bleed area, crop
// marks and a dieline for the die cutter.
//
// svg2pdf only sees attributes on the nodes it is given, so before rendering
// the SVG is cloned and everything the browser resolved through CSS (theme
// colours from SetSvgColors, fonts, dominant-baseline offsets) is written onto
// the clone as plain attributes. Shared <defs> that live in Root.jsx (the hex
// clip paths, arrow marker) and the paginated <use> content are copied in too.

const PT_PER_IN = 72;
const PT_PER_UNIT = PT_PER_IN / 100; // config dimensions are hundredths of an inch

// Sizes in points
const CROP_MARK_LENGTH = 18; // 0.25in
const CROP_MARK_GAP = 4;
const MARK_SPACE = CROP_MARK_LENGTH + CROP_MARK_GAP;
const DIELINE_WIDTH = 0.5;
const DIELINE_COLOR = [255, 0, 255]; // magenta, the usual dieline spot colour

// jsPDF only ships its standard fonts and the app fonts are woff2 data urls it
// can't embed, so map the app font families onto the closest standard font.
const FONT_MAP = {
  display: "helvetica",
  serif: "times",
  "sans-serif": "helvetica",
};

// Computed style properties copied onto the clone as attributes
const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
];

// svg2pdf has no dominant-baseline support; approximate it with a dy shift
const BASELINE_SHIFT = {
  hanging: 0.8,
  "text-before-edge": 0.8,
  central: 0.35,
  middle: 0.35,
  mathematical: 0.35,
};

// The hex clip path from Root.jsx, at scale 1
const HEX_POINTS = [
  [-86.0252, 0],
  [-43.0126, -74.5],
  [43.0126, -74.5],
  [86.0252, 0],
  [43.0126, 74.5],
  [-43.0126, 74.5],
];

// Pages that are html rather than svg and have to go through the print dialog
export const DOM_SECTIONS = ["cards", "charters", "tile-manifest"];

export const isDomSection = (section) => DOM_SECTIONS.includes(section);

const toInches = (value) => {
  if (!value) {
    return null;
  }

  const num = parseFloat(value);
  if (Number.isNaN(num)) {
    return null;
  }

  if (value.endsWith("in")) {
    return num;
  } else if (value.endsWith("mm")) {
    return num / 25.4;
  } else if (value.endsWith("px")) {
    return num / 96;
  }

  return null;
};

const parseViewBox = (svg) => {
  const [x, y, width, height] = (svg.getAttribute("viewBox") || "0 0 0 0")
    .split(/[\s,]+/)
    .map(Number);
  return { x, y, width, height };
};

const parseTranslateScale = (transform) => {
  const translate = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(
    transform || "",
  );
  const scale = /scale\(\s*([-\d.]+)/.exec(transform || "");

  return {
    x: translate ? Number(translate[1]) : 0,
    y: translate ? Number(translate[2]) : 0,
    scale: scale ? Number(scale[1]) : 1,
  };
};

// Which kind of element a game section renders, which tells us where the trim
// edge is: "tiles" and "tokens" sheets get a dieline per item and already draw
// their own bleed, "paginated" pages include the pagination bleed inside the
// svg, and everything else is a plain "page" whose svg is the trim box.
const rootKind = (section, paginated) => {
  if (section === "tiles") {
    return "tiles";
  } else if (section === "tokens") {
    return "tokens";
  } else if (paginated) {
    return "paginated";
  }

  return "page";
};

// Find every svg on the page that is a printable element, with its size in
// inches. Elements size their svgs in inches for printing, which is also what
// tells them apart from decorations like the pins.
const findPrintRoots = (container, kind) => {
  const roots = [];

  for (const svg of container.querySelectorAll("svg")) {
    // Only the outermost svg of each element
    if (svg.parentElement.closest("svg")) {
      continue;
    }

    const editor = svg.parentElement.closest("#editor");
    if (editor) {
      // The zoomable map editor; the full extent is stamped on the wrapper
      const width = Number(editor.dataset.printWidth);
      const height = Number(editor.dataset.printHeight);
      roots.push({
        svg,
        kind,
        widthIn: width / 100,
        heightIn: height / 100,
        viewBox: { x: 0, y: 0, width, height },
      });
      continue;
    }

    const widthIn = toInches(svg.style.width || svg.getAttribute("width"));
    const heightIn = toInches(svg.style.height || svg.getAttribute("height"));
    if (!widthIn || !heightIn) {
      continue;
    }

    roots.push({ svg, kind, widthIn, heightIn, viewBox: parseViewBox(svg) });
  }

  return roots;
};

const firstFontFamily = (fontFamily) =>
  (fontFamily || "")
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");

// Copy what the browser resolved through CSS onto the clone as attributes.
// `original` and `clone` must have identical structure.
const inlineStyles = (original, clone) => {
  const originals = [original, ...original.querySelectorAll("*")];
  const clones = [clone, ...clone.querySelectorAll("*")];

  for (let i = 0; i < originals.length; i++) {
    const source = originals[i];
    const target = clones[i];

    if (!(source instanceof SVGElement)) {
      continue;
    }

    const computed = getComputedStyle(source);

    if (computed.display === "none" || computed.visibility === "hidden") {
      target.remove();
      continue;
    }

    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "none" && value !== "normal") {
        target.setAttribute(prop, value);
      } else if (value === "none" && (prop === "fill" || prop === "stroke")) {
        target.setAttribute(prop, "none");
      }
    }

    const family = firstFontFamily(computed.fontFamily);
    if (family) {
      target.setAttribute("font-family", FONT_MAP[family] || family);
    }

    const baseline =
      source.getAttribute("dominant-baseline") || computed.dominantBaseline;
    const shift = BASELINE_SHIFT[baseline];
    if (shift && (source.tagName === "text" || source.tagName === "tspan")) {
      const fontSize = parseFloat(computed.fontSize) || 12;
      const dy = parseFloat(target.getAttribute("dy")) || 0;
      target.setAttribute("dy", dy + shift * fontSize);
    }
    target.removeAttribute("dominant-baseline");
    target.style.dominantBaseline = "";
  }
};

// Anything referenced by id that lives outside this svg (shared defs from
// Root.jsx, the <g> a paginated page <use>s) gets copied into the clone.
const inlineExternalDefs = (clone) => {
  let defs = clone.querySelector(":scope > defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    clone.prepend(defs);
  }

  const seen = new Set();
  const queue = [clone];

  while (queue.length > 0) {
    const node = queue.pop();
    const ids = new Set();

    for (const el of [node, ...node.querySelectorAll("*")]) {
      for (const attr of el.attributes) {
        const url = /url\(["']?#([^"')]+)["']?\)/.exec(attr.value);
        if (url) {
          ids.add(url[1]);
        }
        if (
          (attr.name === "href" || attr.name === "xlink:href") &&
          attr.value.startsWith("#")
        ) {
          ids.add(attr.value.slice(1));
        }
      }
    }

    for (const id of ids) {
      if (seen.has(id) || clone.querySelector(`[id="${CSS.escape(id)}"]`)) {
        continue;
      }
      seen.add(id);

      const source = document.getElementById(id);
      if (!source) {
        continue;
      }

      const copy = source.cloneNode(true);
      inlineStyles(source, copy);
      defs.appendChild(copy);
      queue.push(copy);
    }
  }
};

const prepareClone = (root) => {
  const clone = root.svg.cloneNode(true);

  inlineStyles(root.svg, clone);
  inlineExternalDefs(clone);

  const { x, y, width, height } = root.viewBox;
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.removeAttribute("style");
  clone.setAttribute("width", root.widthIn * PT_PER_IN);
  clone.setAttribute("height", root.heightIn * PT_PER_IN);

  return clone;
};

const drawCropMarks = (doc, trim, bleed) => {
  const { x, y, width, height } = trim;
  const gap = bleed + CROP_MARK_GAP;
  const length = CROP_MARK_LENGTH;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);

  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + width, y, 1, -1],
    [x, y + height, -1, 1],
    [x + width, y + height, 1, 1],
  ]) {
    // Horizontal mark
    doc.line(cx + dx * gap, cy, cx + dx * (gap + length), cy);
    // Vertical mark
    doc.line(cx, cy + dy * gap, cx, cy + dy * (gap + length));
  }
};

const setDielineStyle = (doc) => {
  doc.setDrawColor(...DIELINE_COLOR);
  doc.setLineWidth(DIELINE_WIDTH);
};

// Maps svg user units of a root onto pdf points
const unitMapper = (root, art) => {
  const scaleX = art.width / root.viewBox.width;
  const scaleY = art.height / root.viewBox.height;

  return (ux, uy) => [
    art.x + (ux - root.viewBox.x) * scaleX,
    art.y + (uy - root.viewBox.y) * scaleY,
    scaleX,
  ];
};

// One dieline per tile on a tile sheet, following the hex cut edge
const drawTileDielines = (doc, root, art) => {
  const toPt = unitMapper(root, art);
  setDielineStyle(doc);

  for (const group of root.svg.querySelectorAll(
    ':scope > g[clip-path^="url(#hexBleed"]',
  )) {
    const { x, y, scale } = parseTranslateScale(
      group.getAttribute("transform"),
    );
    const points = HEX_POINTS.map(([px, py]) =>
      toPt(x + px * scale, y + py * scale),
    );
    const [startX, startY] = points[0];
    const segments = points
      .slice(1)
      .map(([px, py], i) => [px - points[i][0], py - points[i][1]]);
    doc.lines(segments, startX, startY, [1, 1], "S", true);
  }
};

// One dieline per token on a token sheet, following the token's cut edge.
// Tokens draw their clip path themselves: a circle (or square) grown by the
// bleed, so the trim edge is that shape shrunk back down.
const drawTokenDielines = (doc, root, art, bleedUnits) => {
  const toPt = unitMapper(root, art);
  setDielineStyle(doc);

  for (const group of root.svg.querySelectorAll(":scope > g[transform]")) {
    const { x, y } = parseTranslateScale(group.getAttribute("transform"));
    const shape = group.querySelector("clipPath > circle, clipPath > rect");
    if (!shape) {
      continue;
    }

    if (shape.tagName === "circle") {
      const r = Number(shape.getAttribute("r")) - bleedUnits;
      const [cx, cy, scale] = toPt(x, y);
      doc.circle(cx, cy, r * scale, "S");
    } else {
      const side = Number(shape.getAttribute("width")) - 2 * bleedUnits;
      const [left, top, scale] = toPt(x - side / 2, y - side / 2);
      doc.rect(left, top, side * scale, side * scale, "S");
    }
  }
};

// Renders every printable svg in `container` as one pdf page each.
//
// options.bleed adds a bleed area around page elements; paginated pages,
// tiles and tokens already draw their own bleed so it's left alone there.
// options.cropMarks draws trim marks outside the bleed and options.dieline
// draws the cut edge (per tile / token on sheets, the trim box otherwise).
export const renderPdf = ({
  container,
  config,
  options,
  section,
  paginated,
}) => {
  const roots = findPrintRoots(container, rootKind(section, paginated));
  if (roots.length === 0) {
    return null;
  }

  const bleedUnits = config.bleed || 0;
  const bleedPt = bleedUnits * PT_PER_UNIT;
  const markSpace = options.cropMarks ? MARK_SPACE : 0;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.deletePage(1);

  const render = async () => {
    for (const root of roots) {
      const artWidth = root.widthIn * PT_PER_IN;
      const artHeight = root.heightIn * PT_PER_IN;

      // Paginated pages, tile sheets and token sheets already include bleed
      // inside the svg. Plain pages get a bleed area added around them.
      const intrinsicBleed = root.kind === "paginated" ? bleedPt : 0;
      const extraBleed = options.bleed && root.kind === "page" ? bleedPt : 0;
      const pageBleed = intrinsicBleed || extraBleed;

      const pageWidth = artWidth + 2 * (extraBleed + markSpace);
      const pageHeight = artHeight + 2 * (extraBleed + markSpace);

      doc.addPage(
        [pageWidth, pageHeight],
        pageWidth > pageHeight ? "landscape" : "portrait",
      );

      const art = {
        x: markSpace + extraBleed,
        y: markSpace + extraBleed,
        width: artWidth,
        height: artHeight,
      };
      const trim = {
        x: art.x + intrinsicBleed,
        y: art.y + intrinsicBleed,
        width: artWidth - 2 * intrinsicBleed,
        height: artHeight - 2 * intrinsicBleed,
      };

      const clone = prepareClone(root);
      await doc.svg(clone, art);

      if (options.cropMarks) {
        drawCropMarks(doc, trim, pageBleed);
      }

      if (options.dieline) {
        if (root.kind === "tiles") {
          drawTileDielines(doc, root, art);
        } else if (root.kind === "tokens") {
          drawTokenDielines(doc, root, art, config.tokens.bleed ? 5 : 0);
        } else {
          setDielineStyle(doc);
          doc.rect(trim.x, trim.y, trim.width, trim.height, "S");
        }
      }
    }

    return doc;
  };

  return render();
};

export const pdfFilename = (game, section, search) => {
  const params = new URLSearchParams(search);
  let name = `${titleToFilename(game.info.title)}-${section}`;

  if (params.has("variation")) {
    name += `-${params.get("variation")}`;
  }
  if (params.has("paginated")) {
    name += "-paginated";
  }

  return `${name}.pdf`;
};

export const downloadPdf = async ({
  game,
  config,
  section,
  search,
  options,
}) => {
  const container = document.getElementById("viewport-children");
  const paginated = new URLSearchParams(search).has("paginated");
  const doc = await renderPdf({
    container,
    config,
    options,
    section,
    paginated,
  });

  if (!doc) {
    return false;
  }

  doc.save(pdfFilename(game, section, search));
  return true;
};
