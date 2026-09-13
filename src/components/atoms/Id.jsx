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

// Sizing for each shape, as a ratio of fontSize. These are the actual ink
// metrics of the Unicode characters they replace (⏷ ⏹ ⏺ ✱ ★ ⨉ ⏶ 〜) measured
// with canvas 2D's actualBoundingBox* at the browser's default sans-serif --
// advance is the character's own advance width (how much horizontal room the
// old text flow gave it), width/height its ink bounding box, and centerY how
// far above the baseline that ink box sits centred -- so a shape here takes
// up the same space and sits at the same height its glyph used to.
// Triangles are the one deliberate departure: real ones are equilateral
// (height = width * √3/2), not whatever aspect ratio happened to render.
const SHAPE_METRICS = {
  triangleDown: { advance: 0.5, width: 0.5, centerY: 0.3155 },
  triangleUp: { advance: 0.5, width: 0.5, centerY: 0.3565 },
  square: { advance: 0.63, width: 0.486, height: 0.486, centerY: 0.337 },
  circle: { advance: 0.63, width: 0.55, height: 0.55, centerY: 0.3375 },
  star: { advance: 1.0, width: 0.971, height: 0.937, centerY: 0.3905 },
  x: { advance: 0.666, width: 0.541, height: 0.538, centerY: 0.269 },
  asterisk: { advance: 0.744, width: 0.678, height: 0.694, centerY: 0.347 },
  wave: { advance: 1.021, width: 0.773, height: 0.206, centerY: 0.356 },
};
// The gap between a single colorblind shape and the id used to be a real
// space character; two shapes (a striped hex) were concatenated onto each
// other and the id with no spaces at all, so that packing stays tight.
const SPACE_RATIO = 0.2778;

const EQUILATERAL_RATIO = Math.sqrt(3) / 2;

// Metrics for one shape scaled to the current font size, in absolute units
const metricsFor = (shape, fontSize) => {
  const m = SHAPE_METRICS[shape];
  const width = m.width * fontSize;
  const height =
    (m.height != null ? m.height : m.width * EQUILATERAL_RATIO) * fontSize;
  return {
    advance: m.advance * fontSize,
    width,
    height,
    centerY: m.centerY * fontSize,
  };
};

const Symbol = ({ shape, x, y, width, height, fill }) => {
  const rw = width / 2;
  const rh = height / 2;

  switch (shape) {
    // Equilateral triangles, bounding box centred on (x, y): base 2*rw,
    // height 2*rh (rh = rw * √3/2 from metricsFor).
    case "triangleDown":
      return (
        <polygon
          points={`${-rw},${-rh} ${rw},${-rh} 0,${rh}`}
          fill={fill}
          transform={`translate(${x} ${y})`}
        />
      );
    case "triangleUp":
      return (
        <polygon
          points={`${-rw},${rh} ${rw},${rh} 0,${-rh}`}
          fill={fill}
          transform={`translate(${x} ${y})`}
        />
      );
    case "square":
      return (
        <rect x={x - rw} y={y - rh} width={width} height={height} fill={fill} />
      );
    case "circle":
      return <circle cx={x} cy={y} r={rw} fill={fill} />;
    case "star": {
      const points = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? rw : rw * 0.4;
        const ry = i % 2 === 0 ? rh : rh * 0.4;
        points.push(`${x + r * Math.cos(angle)},${y + ry * Math.sin(angle)}`);
      }
      return <polygon points={points.join(" ")} fill={fill} />;
    }
    case "x":
      return (
        <g
          stroke={fill}
          strokeWidth={Math.min(width, height) * 0.26}
          strokeLinecap="round"
        >
          <line x1={x - rw} y1={y - rh} x2={x + rw} y2={y + rh} />
          <line x1={x - rw} y1={y + rh} x2={x + rw} y2={y - rh} />
        </g>
      );
    case "asterisk": {
      const lines = [0, 1, 2].map((i) => {
        const angle = (Math.PI / 3) * i;
        const dx = rw * Math.cos(angle);
        const dy = rh * Math.sin(angle);
        return <line key={i} x1={x - dx} y1={y - dy} x2={x + dx} y2={y + dy} />;
      });
      return (
        <g
          stroke={fill}
          strokeWidth={Math.min(width, height) * 0.24}
          strokeLinecap="round"
        >
          {lines}
        </g>
      );
    }
    case "wave":
      return (
        <path
          d={`M ${x - rw} ${y} Q ${x - rw * 0.5} ${y - rh} ${x} ${y} Q ${x + rw * 0.5} ${y + rh} ${x + rw} ${y}`}
          fill="none"
          stroke={fill}
          strokeWidth={height * 0.45}
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
  const fontSizeNum = parseFloat(fontSize);

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

  // A single shape had a real space before the id; two (a striped hex) were
  // packed with no gap anywhere, including before the id.
  const gapBeforeDigits = shapes.length === 1 ? SPACE_RATIO * fontSizeNum : 0;

  let digitsX = idX;
  const symbolPositions = [];

  if (shapes.length > 0) {
    if (idAnchor === "end") {
      let cursor = idX - digitsWidth - gapBeforeDigits;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const metrics = metricsFor(shapes[i], fontSizeNum);
        symbolPositions.unshift({
          shape: shapes[i],
          x: cursor - metrics.advance / 2,
          metrics,
        });
        cursor -= metrics.advance;
      }
    } else {
      let cursor = idX;
      for (let i = 0; i < shapes.length; i++) {
        const metrics = metricsFor(shapes[i], fontSizeNum);
        symbolPositions.push({
          shape: shapes[i],
          x: cursor + metrics.advance / 2,
          metrics,
        });
        cursor += metrics.advance;
      }
      digitsX = cursor + gapBeforeDigits;
    }
  }

  return (
    <Color>
      {(c) => (
        <>
          <g transform={`rotate(${rotation})`}>
            {symbolPositions.map(({ shape, x, metrics }, i) => (
              <Symbol
                key={i}
                shape={shape}
                x={x}
                y={idY - metrics.centerY}
                width={metrics.width}
                height={metrics.height}
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
