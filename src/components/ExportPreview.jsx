import { useCallback, useEffect, useState } from "react";
import { useLocation, useMatch } from "react-router";

import { useConfig, useGame } from "@/hooks";
import {
  HEX_POINTS,
  exportBleed,
  findPrintRoots,
  isDomSection,
  parseTranslateScale,
  rootKind,
} from "@/util/pdf";
import { useBooleanParam } from "@/util/query";

// Draws what the PDF export options will do, on top of the canvas: the bleed
// band, crop marks and dieline, using the same geometry as the exporter. It
// is a fixed, click-through svg over the viewport; every printable svg on the
// page is measured on screen and its user units mapped to viewport pixels,
// which is also what keeps it in place while the map editor pans and zooms.

// In config units (hundredths of an inch)
const CROP_MARK_LENGTH = 25;
const CROP_MARK_GAP = 6;

// Map svg user units onto viewport pixels, honouring the default
// xMidYMid meet fitting (the map editor letterboxes its viewBox).
const mapper = (svg) => {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
  const originX = rect.left + (rect.width - vb.width * scale) / 2;
  const originY = rect.top + (rect.height - vb.height * scale) / 2;

  return {
    scale,
    toPx: (ux, uy) => [
      originX + (ux - vb.x) * scale,
      originY + (uy - vb.y) * scale,
    ],
  };
};

const cropMarks = (trim, gap, length) => {
  const marks = [];
  const { x, y, width, height } = trim;

  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + width, y, 1, -1],
    [x, y + height, -1, 1],
    [x + width, y + height, 1, 1],
  ]) {
    marks.push([cx + dx * gap, cy, cx + dx * (gap + length), cy]);
    marks.push([cx, cy + dy * gap, cx, cy + dy * (gap + length)]);
  }

  return marks;
};

const measure = (container, kind, config, options) => {
  const shapes = { bleed: [], marks: [], dielines: [] };
  const paginationBleed = config.bleed || 0;
  const bleedUnits = exportBleed(config);
  const tokenBleed = config.export.bleed ? 5 : 0;

  for (const root of findPrintRoots(container, kind)) {
    const { scale, toPx } = mapper(root.svg);
    const [left, top] = toPx(root.viewBox.x, root.viewBox.y);
    const width = root.viewBox.width * scale;
    const height = root.viewBox.height * scale;

    const intrinsicBleed = kind === "paginated" ? paginationBleed * scale : 0;
    const extraBleed =
      options.bleed && kind === "page" ? bleedUnits * scale : 0;
    const trim = {
      x: left + intrinsicBleed,
      y: top + intrinsicBleed,
      width: width - 2 * intrinsicBleed,
      height: height - 2 * intrinsicBleed,
    };

    if (extraBleed > 0) {
      shapes.bleed.push({
        outer: {
          x: trim.x - extraBleed,
          y: trim.y - extraBleed,
          width: trim.width + 2 * extraBleed,
          height: trim.height + 2 * extraBleed,
        },
        inner: trim,
      });
    }

    // Paginated pages already show their crop marks in the page frame
    if (options.cropMarks && kind !== "paginated") {
      shapes.marks.push(
        ...cropMarks(
          trim,
          extraBleed + CROP_MARK_GAP * scale,
          CROP_MARK_LENGTH * scale,
        ),
      );
    }

    if (!options.dieline) {
      continue;
    }

    if (kind === "tiles") {
      for (const group of root.svg.querySelectorAll(
        ':scope > g[clip-path^="url(#hex"]',
      )) {
        const t = parseTranslateScale(group.getAttribute("transform"));
        shapes.dielines.push({
          type: "polygon",
          points: HEX_POINTS.map(([px, py]) =>
            toPx(t.x + px * t.scale, t.y + py * t.scale).join(","),
          ).join(" "),
        });
      }
    } else if (kind === "tokens") {
      for (const group of root.svg.querySelectorAll(":scope > g[transform]")) {
        const t = parseTranslateScale(group.getAttribute("transform"));
        const shape = group.querySelector("clipPath > circle, clipPath > rect");
        if (!shape) {
          continue;
        }

        if (shape.tagName === "circle") {
          const [cx, cy] = toPx(t.x, t.y);
          const r = (Number(shape.getAttribute("r")) - tokenBleed) * scale;
          shapes.dielines.push({ type: "circle", cx, cy, r });
        } else {
          const side = Number(shape.getAttribute("width")) - 2 * tokenBleed;
          const [x, y] = toPx(t.x - side / 2, t.y - side / 2);
          shapes.dielines.push({
            type: "rect",
            x,
            y,
            width: side * scale,
            height: side * scale,
          });
        }
      }
    } else {
      shapes.dielines.push({ type: "rect", ...trim });
    }
  }

  return shapes;
};

const ExportPreview = () => {
  const location = useLocation();
  const game = useGame();
  const { config } = useConfig();
  const [print] = useBooleanParam("print");
  const [paginated] = useBooleanParam("paginated");
  const match = useMatch("/games/:slug/:section/*");
  const [shapes, setShapes] = useState(null);

  const section = match && match.params.section;
  const options = config.export;
  const enabled =
    !print &&
    game &&
    section &&
    !isDomSection(section) &&
    section !== "b18" &&
    (options.bleed || options.cropMarks || options.dieline);

  const update = useCallback(() => {
    const container = document.getElementById("viewport-children");
    if (!enabled || !container) {
      setShapes(null);
      return;
    }

    setShapes(
      measure(container, rootKind(section, paginated), config, options),
    );
  }, [enabled, section, paginated, config, options]);

  useEffect(() => {
    let frame = null;
    const schedule = () => {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          update();
        });
      }
    };

    schedule();

    // Re-measure whenever the page moves or the svgs change (the editor
    // pans and zooms by rewriting its viewBox)
    const observer = new MutationObserver(schedule);
    const container = document.getElementById("viewport-children");
    if (container) {
      observer.observe(container, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["viewBox", "transform", "style", "class"],
      });
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [update, location.pathname, location.search]);

  if (!shapes) {
    return null;
  }

  return (
    <svg
      className="print:hidden pointer-events-none fixed inset-0 z-30 w-screen h-screen"
      aria-hidden="true"
    >
      {shapes.bleed.map(({ outer, inner }, i) => (
        <path
          key={`bleed-${i}`}
          fillRule="evenodd"
          fill="rgba(255, 0, 255, 0.08)"
          stroke="rgba(255, 0, 255, 0.5)"
          strokeWidth="1"
          strokeDasharray="4 3"
          d={`M${outer.x},${outer.y}h${outer.width}v${outer.height}h${-outer.width}z M${inner.x},${inner.y}h${inner.width}v${inner.height}h${-inner.width}z`}
        />
      ))}
      {shapes.marks.map(([x1, y1, x2, y2], i) => (
        <line
          key={`mark-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="black"
          strokeWidth="1"
        />
      ))}
      {shapes.dielines.map((shape, i) => {
        const style = { fill: "none", stroke: "#ff00ff", strokeWidth: 1.5 };
        if (shape.type === "polygon") {
          return <polygon key={`die-${i}`} points={shape.points} {...style} />;
        } else if (shape.type === "circle") {
          return (
            <circle
              key={`die-${i}`}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              {...style}
            />
          );
        }
        return (
          <rect
            key={`die-${i}`}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            {...style}
          />
        );
      })}
    </svg>
  );
};

export default ExportPreview;
