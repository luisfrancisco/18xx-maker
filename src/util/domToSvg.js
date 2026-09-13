import { inlineStyles } from "@/util/pdf";

// Turns a laid out html element (a card, a charter) into an svg of plain
// geometry: a rect for every background and border, a <text> for every line
// of text, and the inline svgs (logos, tokens, hexes) dropped in where they
// sit. Everything is measured from the browser's own layout, so positions are
// exact; what changes is the font, which the pdf can only approximate with its
// standard faces. The result goes through the same vector exporter as the svg
// elements, so cards come out as editable shapes and text rather than pixels.

const SVG_NS = "http://www.w3.org/2000/svg";

// jsPDF's standard fonts stand in for the app fonts
const FONT_MAP = {
  display: "Bitter",
  serif: "times",
  "sans-serif": "helvetica",
};

const LIST_MARKERS = {
  disc: "•",
  circle: "◦",
  square: "▪",
};

const create = (name) => document.createElementNS(SVG_NS, name);

const isTransparent = (color) =>
  !color || color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

const fontFamily = (cssFamily) => {
  const first = (cssFamily || "")
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
  return FONT_MAP[first] || first || "helvetica";
};

// The canvas font shorthand, without the line-height the css shorthand
// carries (canvas rejects the whole string when it is there)
const canvasFont = (cs) =>
  `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;

// Where the baseline sits inside a text rect, measured with the font the
// browser actually laid the text out with
let canvasContext = null;
const descentCache = new Map();
const fontDescent = (font, fontSize) => {
  if (descentCache.has(font)) {
    return descentCache.get(font);
  }

  let descent = 0.22 * fontSize;
  try {
    canvasContext =
      canvasContext || document.createElement("canvas").getContext("2d");
    canvasContext.font = font;
    const metrics = canvasContext.measureText("Hg");
    if (metrics.fontBoundingBoxDescent > 0) {
      descent = metrics.fontBoundingBoxDescent;
    }
  } catch {
    // keep the estimate
  }

  descentCache.set(font, descent);
  return descent;
};

const union = (rects) => {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

export const domToSvg = (root) => {
  const origin = root.getBoundingClientRect();
  const rel = (r) => ({
    x: r.left - origin.left,
    y: r.top - origin.top,
    width: r.width,
    height: r.height,
  });

  const svg = create("svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `0 0 ${origin.width} ${origin.height}`);
  svg.setAttribute("width", origin.width);
  svg.setAttribute("height", origin.height);
  const defs = create("defs");
  svg.appendChild(defs);
  let clipCount = 0;

  const addRect = (parent, box, attrs) => {
    if (box.width <= 0 || box.height <= 0) {
      return null;
    }
    const rect = create("rect");
    rect.setAttribute("x", box.x);
    rect.setAttribute("y", box.y);
    rect.setAttribute("width", box.width);
    rect.setAttribute("height", box.height);
    for (const [key, value] of Object.entries(attrs)) {
      if (value != null && value !== "") {
        rect.setAttribute(key, value);
      }
    }
    parent.appendChild(rect);
    return rect;
  };

  const addLine = (parent, x1, y1, x2, y2, color, width) => {
    const line = create("line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", width);
    parent.appendChild(line);
  };

  const addText = (parent, str, x, y, cs, anchor = "start") => {
    const text = create("text");
    text.setAttribute("x", x);
    text.setAttribute("y", y);
    text.setAttribute("font-family", fontFamily(cs.fontFamily));
    text.setAttribute("font-size", parseFloat(cs.fontSize));
    text.setAttribute("font-weight", cs.fontWeight);
    text.setAttribute("font-style", cs.fontStyle);
    text.setAttribute("fill", cs.color);
    text.setAttribute("text-anchor", anchor);
    text.textContent = str;
    parent.appendChild(text);
  };

  const borderRadius = (cs) => {
    const radii = [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ].map((r) => parseFloat(r) || 0);
    // svg rects only do one radius; use it when the corners agree, else
    // the largest as an approximation
    return Math.max(...radii);
  };

  const addBorders = (parent, box, cs) => {
    const sides = ["Top", "Right", "Bottom", "Left"].map((side) => ({
      width: parseFloat(cs[`border${side}Width`]) || 0,
      style: cs[`border${side}Style`],
      color: cs[`border${side}Color`],
    }));
    const drawn = sides.filter(
      (s) => s.width > 0 && s.style !== "none" && !isTransparent(s.color),
    );
    if (drawn.length === 0) {
      return;
    }

    const uniform =
      drawn.length === 4 &&
      sides.every(
        (s) => s.width === sides[0].width && s.color === sides[0].color,
      );
    if (uniform) {
      const w = sides[0].width;
      addRect(
        parent,
        {
          x: box.x + w / 2,
          y: box.y + w / 2,
          width: box.width - w,
          height: box.height - w,
        },
        {
          fill: "none",
          stroke: sides[0].color,
          "stroke-width": w,
          rx: borderRadius(cs) || null,
        },
      );
      return;
    }

    const [top, right, bottom, left] = sides;
    const { x, y, width, height } = box;
    if (top.width > 0 && top.style !== "none") {
      addLine(
        parent,
        x,
        y + top.width / 2,
        x + width,
        y + top.width / 2,
        top.color,
        top.width,
      );
    }
    if (bottom.width > 0 && bottom.style !== "none") {
      addLine(
        parent,
        x,
        y + height - bottom.width / 2,
        x + width,
        y + height - bottom.width / 2,
        bottom.color,
        bottom.width,
      );
    }
    if (left.width > 0 && left.style !== "none") {
      addLine(
        parent,
        x + left.width / 2,
        y,
        x + left.width / 2,
        y + height,
        left.color,
        left.width,
      );
    }
    if (right.width > 0 && right.style !== "none") {
      addLine(
        parent,
        x + width - right.width / 2,
        y,
        x + width - right.width / 2,
        y + height,
        right.color,
        right.width,
      );
    }
  };

  // One <text> per rendered line of a text node, placed where the browser put
  // it. Lines are found by walking the characters and watching where the
  // rects wrap.
  const addTextNode = (parent, node, cs) => {
    const data = node.data;
    if (!data.trim()) {
      return;
    }

    const range = document.createRange();
    const lines = [];
    let start = 0;
    let lastTop = null;
    for (let i = 0; i < data.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      if (rects.length === 0 || rects[0].width === 0) {
        continue;
      }
      const top = rects[0].top;
      if (lastTop !== null && Math.abs(top - lastTop) > 1) {
        lines.push([start, i]);
        start = i;
      }
      lastTop = top;
    }
    lines.push([start, data.length]);

    const fontSize = parseFloat(cs.fontSize);
    const descent = fontDescent(canvasFont(cs), fontSize);

    for (const [from, to] of lines) {
      const str = data.slice(from, to).replace(/\s+/g, " ").trim();
      if (!str) {
        continue;
      }
      range.setStart(node, from);
      range.setEnd(node, to);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      if (rects.length === 0) {
        continue;
      }
      const box = union(rects);
      addText(
        parent,
        str,
        box.left - origin.left,
        box.bottom - origin.top - descent,
        cs,
      );
    }
  };

  // List items lose their ::marker in a dom walk; draw it by hand
  const addMarker = (parent, li, cs) => {
    const type = cs.listStyleType;
    if (!type || type === "none") {
      return;
    }

    const index = [...li.parentElement.children].indexOf(li) + 1;
    const marker = type === "decimal" ? `${index}.` : LIST_MARKERS[type] || "•";

    const range = document.createRange();
    range.selectNodeContents(li);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const first = rects[0] || li.getBoundingClientRect();
    const fontSize = parseFloat(cs.fontSize);

    addText(
      parent,
      marker,
      first.left - origin.left - 0.35 * fontSize,
      first.top -
        origin.top +
        first.height -
        fontDescent(canvasFont(cs), fontSize),
      cs,
      "end",
    );
  };

  const addImage = (parent, img, cs) => {
    const box = rel(img.getBoundingClientRect());
    const pad = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    const image = create("image");
    image.setAttribute("x", box.x + pad.left);
    image.setAttribute("y", box.y + pad.top);
    image.setAttribute("width", box.width - pad.left - pad.right);
    image.setAttribute("height", box.height - pad.top - pad.bottom);
    image.setAttribute("href", img.currentSrc || img.src);
    image.setAttribute("preserveAspectRatio", "xMidYMid meet");
    parent.appendChild(image);
  };

  const addInlineSvg = (parent, el) => {
    const box = rel(el.getBoundingClientRect());
    const clone = el.cloneNode(true);
    inlineStyles(el, clone);
    clone.removeAttribute("style");
    clone.removeAttribute("class");
    clone.setAttribute("x", box.x);
    clone.setAttribute("y", box.y);
    clone.setAttribute("width", box.width);
    clone.setAttribute("height", box.height);
    if (!clone.getAttribute("viewBox")) {
      clone.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    }
    parent.appendChild(clone);
  };

  const visit = (el, parent) => {
    const cs = getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      parseFloat(cs.opacity) === 0
    ) {
      return;
    }

    if (el.namespaceURI === SVG_NS) {
      if (el.tagName.toLowerCase() === "svg") {
        addInlineSvg(parent, el);
      }
      return;
    }

    if (el.tagName === "IMG") {
      addImage(parent, el, cs);
      return;
    }

    const box = rel(el.getBoundingClientRect());
    const group = create("g");
    if (parseFloat(cs.opacity) < 1) {
      group.setAttribute("opacity", cs.opacity);
    }

    if (!isTransparent(cs.backgroundColor)) {
      addRect(group, box, {
        fill: cs.backgroundColor,
        rx: borderRadius(cs) || null,
      });
    }
    addBorders(group, box, cs);

    let container = group;
    if (/hidden|clip/.test(cs.overflow)) {
      const clip = create("clipPath");
      clip.id = `dom-clip-${clipCount++}`;
      addRect(clip, box, {});
      defs.appendChild(clip);
      container = create("g");
      container.setAttribute("clip-path", `url(#${clip.id})`);
      group.appendChild(container);
    }

    if (el.tagName === "LI") {
      addMarker(container, el, cs);
    }

    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        addTextNode(container, node, cs);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        visit(node, container);
      }
    }

    parent.appendChild(group);
  };

  visit(root, svg);
  return svg;
};

export default domToSvg;
