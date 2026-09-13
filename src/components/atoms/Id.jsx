import { useLayoutEffect, useRef, useState } from "react";

import Color from "@/components/Color";

import { useOrientation } from "@/context/OrientationContext";
import { useConfig } from "@/hooks";

// Which shape to draw for each background colour in colorblind mode. Used to
// be a Unicode dingbat character prefixed onto the id string (⏷ ⏹ ⏺ ✱ ★ ⨉ ⏶
// 〜), but none of those code points exist in the fonts we embed in exported
// PDFs, and jsPDF's standard fonts can only encode WinAnsi/Latin-1 -- a PDF
// export scrambled each one into an unrelated pair of WinAnsi characters
// (U+23F7 became "#÷", the high and low byte of the code point read back as
// two separate Latin-1 glyphs). A vector shape has no font dependency and
// exports correctly everywhere.
const colorblindShapes = {
  plain: null,
  yellow: "triangleDown",
  green: "square",
  land: "square",
  brown: "circle",
  gray: "asterisk",
  grey: "asterisk",
  orange: "star",
  red: "x",
  offboard: "x",
  mountain: "triangleUp",
  water: "wave",
};

const shapeFor = (color) => colorblindShapes[color] || null;

// Equilateral triangle of base 2r, centred on its own centroid: the same
// base/height ratio (1/√3 and 2/√3 times the half-base) as the big
// private-company triangle in atoms/shapes/Triangle.jsx.
const TRIANGLE_BASE = 1 / Math.sqrt(3);
const TRIANGLE_APEX = 2 / Math.sqrt(3);

const Symbol = ({ shape, x, y, size, fill }) => {
  const r = size / 2;

  switch (shape) {
    case "triangleDown":
      return (
        <polygon
          points={`${-r},${-r * TRIANGLE_BASE} ${r},${-r * TRIANGLE_BASE} 0,${r * TRIANGLE_APEX}`}
          fill={fill}
          transform={`translate(${x} ${y})`}
        />
      );
    case "triangleUp":
      return (
        <polygon
          points={`${-r},${r * TRIANGLE_BASE} ${r},${r * TRIANGLE_BASE} 0,${-r * TRIANGLE_APEX}`}
          fill={fill}
          transform={`translate(${x} ${y})`}
        />
      );
    case "square":
      return (
        <rect
          x={x - r * 0.75}
          y={y - r * 0.75}
          width={r * 1.5}
          height={r * 1.5}
          fill={fill}
        />
      );
    case "circle":
      return <circle cx={x} cy={y} r={r * 0.8} fill={fill} />;
    case "star": {
      const points = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.42;
        points.push(
          `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`,
        );
      }
      return <polygon points={points.join(" ")} fill={fill} />;
    }
    case "x":
      return (
        <g stroke={fill} strokeWidth={size * 0.24} strokeLinecap="round">
          <line
            x1={x - r * 0.7}
            y1={y - r * 0.7}
            x2={x + r * 0.7}
            y2={y + r * 0.7}
          />
          <line
            x1={x - r * 0.7}
            y1={y + r * 0.7}
            x2={x + r * 0.7}
            y2={y - r * 0.7}
          />
        </g>
      );
    case "asterisk": {
      const lines = [0, 1, 2].map((i) => {
        const angle = (Math.PI / 3) * i;
        const dx = r * Math.cos(angle);
        const dy = r * Math.sin(angle);
        return <line key={i} x1={x - dx} y1={y - dy} x2={x + dx} y2={y + dy} />;
      });
      return (
        <g stroke={fill} strokeWidth={size * 0.2} strokeLinecap="round">
          {lines}
        </g>
      );
    }
    case "wave":
      return (
        <path
          d={`M ${x - r} ${y} Q ${x - r * 0.5} ${y - r * 0.8} ${x} ${y} Q ${x + r * 0.5} ${y + r * 0.8} ${x + r} ${y}`}
          fill="none"
          stroke={fill}
          strokeWidth={size * 0.2}
          strokeLinecap="round"
        />
      );
    default:
      return null;
  }
};

const Id = ({ id, displayID, extra, bgColor, noID }) => {
  const { config } = useConfig();
  const rotation = useOrientation();
  const digitsRef = useRef(null);
  const [digitsWidth, setDigitsWidth] = useState(0);

  const hidden = noID || config.tiles.id === "none";
  const digits = displayID || id;

  // Which colorblind shapes (if any) to draw before the id, in the order
  // they were previously concatenated onto the id string
  let shapes = [];
  if (config.tiles.colorblind) {
    const [background, stripe] = bgColor.split("/");
    shapes = [shapeFor(background), stripe ? shapeFor(stripe) : null].filter(
      Boolean,
    );
  }

  // The id shrinks to make room the same way it used to when the colorblind
  // shapes were characters prefixed onto the same string
  let effectiveLength =
    (digits ? digits.length : 0) + (shapes.length > 0 ? 2 : 0);
  let fontSize = effectiveLength > 4 ? "9" : effectiveLength > 3 ? "10" : "12";
  let extraFontSize =
    extra && extra.length > 4 ? "9" : extra && extra.length > 3 ? "10" : "12";

  // The id sits in a bottom corner, 70 units down and 40 across. Ids that
  // run close to the cut edge can be pulled in towards the centre with the
  // tiles.idOffsetX / idOffsetY config: X moves them inward, Y moves them up.
  const offsetX = config.tiles.idOffsetX || 0;
  const offsetY = config.tiles.idOffsetY || 0;
  const idY = 70 - offsetY;

  // Otherwise it's right or left
  let idAnchor = "end";
  let extraAnchor = "start";
  let idX = 40 - offsetX;
  let extraX = -40 + offsetX;
  if (config.tiles.id === "left") {
    idAnchor = "start";
    extraAnchor = "end";
    idX = -40 + offsetX;
    extraX = 40 - offsetX;
  }

  // Only the anchor="end" layout needs to know the digits' own rendered
  // width up front, to place the shapes just before them; anchor="start"
  // places the digits after the shapes instead, so their width isn't needed
  // until they're drawn.
  useLayoutEffect(() => {
    if (
      !hidden &&
      idAnchor === "end" &&
      shapes.length > 0 &&
      digitsRef.current
    ) {
      setDigitsWidth(digitsRef.current.getComputedTextLength());
    }
  }, [hidden, idAnchor, shapes.length, digits, fontSize]);

  if (hidden) {
    return null;
  }

  const symbolSize = parseFloat(fontSize) * 0.85;
  // The two colorblind shapes for a striped hex were concatenated directly
  // onto each other with no gap, and only the last one had a gap before the
  // id; keep that same tight packing.
  const gap = parseFloat(fontSize) * 0.25;
  // The digits sit on the baseline (idY), so most of their height is above
  // it; a shape centred on idY would hang visibly low next to them. Lift it
  // by roughly half a digit's cap-height so it lines up with the digits'
  // visual centre instead.
  const symbolY = idY - parseFloat(fontSize) * 0.35;

  let digitsX = idX;
  const symbolPositions = [];

  if (shapes.length > 0) {
    if (idAnchor === "end") {
      let cursor = idX - digitsWidth - gap;
      for (let i = shapes.length - 1; i >= 0; i--) {
        symbolPositions.unshift({
          shape: shapes[i],
          x: cursor - symbolSize / 2,
        });
        cursor -= symbolSize;
      }
    } else {
      let cursor = idX;
      for (let i = 0; i < shapes.length; i++) {
        symbolPositions.push({ shape: shapes[i], x: cursor + symbolSize / 2 });
        cursor += symbolSize;
      }
      digitsX = cursor + gap;
    }
  }

  return (
    <Color>
      {(c) => (
        <>
          <g transform={`rotate(${rotation})`}>
            {symbolPositions.map(({ shape, x }, i) => (
              <Symbol
                key={i}
                shape={shape}
                x={x}
                y={symbolY}
                size={symbolSize}
                fill={c("black")}
              />
            ))}
            <text
              ref={digitsRef}
              fontFamily="sans-serif"
              fill={c("black")}
              stroke="none"
              strokeLinecap="round"
              strokeLinejoin="bevel"
              dominantBaseline="baseline"
              textAnchor={idAnchor}
              fontSize={fontSize}
              fontWeight="normal"
              x={digitsX}
              y={idY}
            >
              {digits}
            </text>
          </g>
          {extra && (
            <g transform={`rotate(${rotation})`}>
              <text
                fontFamily="sans-serif"
                fill={c("black")}
                stroke="none"
                strokeLinecap="round"
                strokeLinejoin="bevel"
                dominantBaseline="baseline"
                textAnchor={extraAnchor}
                fontSize={extraFontSize}
                x={extraX}
                y={idY}
              >
                {extra}
              </text>
            </g>
          )}
        </>
      )}
    </Color>
  );
};

export default Id;
