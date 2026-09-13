import Color from "@/components/Color";

import { useOrientation } from "@/context/OrientationContext";
import { useConfig } from "@/hooks";
import { COLORBLIND_FONT } from "@/util/pdfFonts";

const colorblindSymbols = {
  plain: "",
  yellow: "⏷",
  green: "⏹",
  land: "⏹",
  brown: "⏺",
  gray: "✱",
  grey: "✱",
  orange: "★",
  red: "⨉",
  offboard: "⨉",
  mountain: "⏶",
  water: "〜",
};

const symbol = (color) => {
  return colorblindSymbols[color] || "";
};

const Id = ({ id, displayID, extra, bgColor, noID }) => {
  const { config } = useConfig();
  const rotation = useOrientation();

  if (noID || config.tiles.id === "none") {
    return null;
  }

  // The colorblind symbols are drawn in their own embedded font (see
  // fonts/ColorblindSymbols.ttf): the default sans-serif has none of these
  // glyphs, so the browser used whatever fallback it found and a PDF export
  // had nothing to render them with at all.
  let symbols = "";
  let separator = "";
  if (config.tiles.colorblind) {
    const [background, stripe] = bgColor.split("/");

    if (stripe) {
      symbols = `${symbol(background)}${symbol(stripe)}`;
    } else {
      symbols = symbol(background);
      separator = " ";
    }
  }

  const label = `${symbols}${separator}${id}`;
  let fontSize = label.length > 4 ? "9" : label.length > 3 ? "10" : "12";
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

  return (
    <Color>
      {(c) => (
        <>
          <g transform={`rotate(${rotation}) translate(${idX} ${idY})`}>
            <text
              fontFamily="sans-serif"
              fill={c("black")}
              stroke="none"
              strokeLinecap="round"
              strokeLinejoin="bevel"
              dominantBaseline="baseline"
              textAnchor={idAnchor}
              fontSize={fontSize}
              fontWeight="normal"
              x="0"
              y="0"
            >
              {displayID || (
                <>
                  {symbols && (
                    <tspan fontFamily={COLORBLIND_FONT}>{symbols}</tspan>
                  )}
                  {separator}
                  {id}
                </>
              )}
            </text>
          </g>
          {extra && (
            <g transform={`rotate(${rotation}) translate(${extraX} ${idY})`}>
              <text
                fontFamily="sans-serif"
                fill={c("black")}
                stroke="none"
                strokeLinecap="round"
                strokeLinejoin="bevel"
                dominantBaseline="baseline"
                textAnchor={extraAnchor}
                fontSize={extraFontSize}
                x="0"
                y="0"
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
