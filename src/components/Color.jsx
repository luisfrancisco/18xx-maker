import tinycolor from "tinycolor2";

import { curry, defaultTo, is, mergeDeepRight, prop } from "ramda";

import ColorContext from "@/context/ColorContext";
import PhaseContext from "@/context/PhaseContext";
import { companyThemes, mapThemes } from "@/data";
import { useConfig, useGame } from "@/hooks";

const colorAliases = {
  cyan: "lightBlue",
  grey: "gray",
  lightGreen: "brightGreen",
  navy: "navyBlue",
  purple: "violet",
};

const buildPalette = (theme, companiesTheme, game) => {
  let colors = prop(
    "colors",
    defaultTo(prop("gmt", mapThemes), prop(theme, mapThemes)),
  );

  // Add in company colors
  colors = {
    ...colors,
    companies: mergeDeepRight(
      prop("colors", prop("rob", companyThemes)),
      prop(
        "colors",
        defaultTo(
          prop("rob", companyThemes),
          prop(companiesTheme, companyThemes),
        ),
      ),
    ),
  };

  // Add in game colors
  return mergeDeepRight(colors, game ? game.colors || {} : {});
};

// Resolving a single color used to rebuild and deep merge the whole palette,
// which happens thousands of times per map render. Build it once per theme and
// game instead.
const paletteCache = new Map();
const getPalette = (theme, companiesTheme, game) => {
  const key = `${theme} ${companiesTheme}`;
  const cached = paletteCache.get(key);

  if (cached && cached.game === game) {
    return cached.palette;
  }

  const palette = buildPalette(theme, companiesTheme, game);
  paletteCache.set(key, { game, palette });
  return palette;
};

const resolveColor = curry((palette, phase, context, name) => {
  if (colorAliases[name]) {
    name = colorAliases[name];
  }

  // Get color from context if it exists
  let color = palette[name];
  if (palette[context] && palette[context][name]) {
    color = palette[context][name];
  }

  // If color is an object use phase
  if (is(Object, color)) {
    color = color[phase || "default"] || color["default"];
  }
  return color;
});

const textColorCache = new WeakMap();
const textColor = curry((palette, phase, color) => {
  let resolved = textColorCache.get(palette);
  if (!resolved) {
    resolved = new Map();
    textColorCache.set(palette, resolved);
  }

  const key = `${phase} ${color}`;
  if (resolved.has(key)) {
    return resolved.get(key);
  }

  let text = [
    resolveColor(palette, phase, null, "white"),
    resolveColor(palette, phase, null, "black"),
  ];
  let tc = tinycolor(color);
  const value = tinycolor.mostReadable(tc, text).toRgbString();

  resolved.set(key, value);
  return value;
});

const strokeColor = (color, amount = 20) => {
  let tc = tinycolor(color);

  if (amount >= 0) {
    return tc.darken(amount).toString();
  } else {
    return tc.lighten(-1 * amount).toString();
  }
};

const Color = ({ context, children }) => {
  const { config } = useConfig();
  const game = useGame();
  const { theme, companiesTheme } = config;

  const palette = getPalette(theme, companiesTheme, game);

  return (
    <ColorContext.Consumer>
      {(colorContext) => (
        <PhaseContext.Consumer>
          {(phase) => {
            let c = resolveColor(palette, phase, context || colorContext);
            let p = resolveColor(palette, phase, undefined);
            let t = textColor(palette, phase);
            let s = strokeColor;

            return <>{children(c, t, s, p)}</>;
          }}
        </PhaseContext.Consumer>
      )}
    </ColorContext.Consumer>
  );
};

export default Color;
