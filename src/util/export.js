import { assoc, flatten, forEach, is, keys, map, range } from "ramda";

import schema from "@/schemas/config.schema.json";
import { maxPlayers, titleToFilename } from "@/util";
import { compileCompanies, overrideCompanies } from "@/util/companies";

// The lists of app paths (and the file each should be saved as) that the
// electron app walks when exporting a whole game. Lived in ExportButton.jsx
// before the shadcn UI; the buttons are now in PrintActions.jsx.

export const pngItems = (game, config) => {
  const filename = titleToFilename(game.info.title);
  let items = {
    background: `${filename}-background.png`,
    revenue: `${filename}-revenue.png`,
  };

  // Number Cards
  forEach(
    (n) => {
      items[`cards/number/${n}`] = `${filename}-card-number-${n}.png`;
    },
    range(1, maxPlayers(game.players || []) + 1),
  );

  // Privates
  for (let i = 0; i < (game.privates || []).length; i++) {
    items[`cards/private/${i}`] = `${filename}-card-private-${i + 1}.png`;
  }

  // Trains
  for (let i = 0; i < (game.trains || []).length; i++) {
    items[`cards/train/${i}`] =
      `${filename}-card-train-${i + 1}-${game.trains[i].name.replace(" ", "_")}.png`;
  }

  // Shares
  const override = config.overrideCompanies;
  const selection = config.overrideSelection;
  let companies =
    overrideCompanies(compileCompanies(game), override, selection) || [];
  let shares = flatten(
    map((c) => map((s) => assoc("company", c, s), c.shares || []), companies),
  );
  for (let i = 0; i < shares.length; i++) {
    items[`cards/share/${i}`] =
      `${filename}-card-share-${i + 1}-${shares[i].company.abbrev}.png`;
  }

  for (let i = 0; i < companies.length; i++) {
    items[`charters/${i}`] =
      `${filename}-charter-${i + 1}-${companies[i].abbrev}.png`;
  }

  for (let i = 0; i < companies.length; i++) {
    items[`tokens/${i}`] =
      `${filename}-token-${i + 1}-${companies[i].abbrev}.png`;
  }

  for (let i = 0; i < (game.tokens || []).length; i++) {
    items[`tokens/${i + companies.length}`] =
      `${filename}-token-${i + 1 + companies.length}.png`;
  }

  if (game.map) {
    if (is(Array, game.map)) {
      for (let i = 0; i < game.map.length; i++) {
        items[`map?variation=${i}`] = `${filename}-map-${i}.png`;
      }
    } else {
      items["map"] = `${filename}-map.png`;
    }
  }

  if (game.stock) {
    if (game.stock.market) {
      items["market"] = `${filename}-market.png`;
    }

    if (game.stock.par && game.stock.par.values) {
      items["par"] = `${filename}-par.png`;
    }
  }

  if (game.tiles) {
    items["tile-manifest"] = `${filename}-tile-manifest.png`;

    forEach((id) => {
      items[`tiles/${id}`] = `${filename}-tile-${id}.png`;
    }, keys(game.tiles));
  }

  return items;
};

export const pdfItems = (game, config) => {
  const filename = titleToFilename(game.info.title);
  let items = {
    background: `${filename}-background.pdf`,
    revenue: `${filename}-revenue.pdf`,
    "revenue?paginated=true": `${filename}-revenue-paginated.pdf`,
  };

  if (config.export.allLayouts) {
    forEach((layout) => {
      items[`cards?config.cards.layout=${layout}`] =
        `${filename}-cards-${layout}.pdf`;
    }, schema.properties.cards.properties.layout.enum);
  } else {
    items["cards"] = `${filename}-cards.pdf`;
  }

  if (game.companies || game.tokens) {
    if (config.export.allLayouts) {
      forEach((layout) => {
        items[`tokens?config.tokens.layout=${layout}`] =
          `${filename}-tokens-${layout}.pdf`;
      }, schema.properties.tokens.properties.layout.enum);
    } else {
      items["tokens"] = `${filename}-tokens.pdf`;
    }
  }

  if (game.companies) {
    items["charters"] = `${filename}-charters.pdf`;
  }

  if (game.map) {
    if (is(Array, game.map)) {
      for (let i = 0; i < game.map.length; i++) {
        items[`map?variation=${i}`] = `${filename}-map-${i}.pdf`;
        items[`map?paginated=true&variation=${i}`] =
          `${filename}-map-${i}-paginated.pdf`;
      }
    } else {
      items["map"] = `${filename}-map.pdf`;
      items["map?paginated=true"] = `${filename}-map-paginated.pdf`;
    }
  }

  if (game.stock) {
    if (game.stock.market) {
      items["market"] = `${filename}-market.pdf`;
      items["market?paginated=true"] = `${filename}-market-paginated.pdf`;
    }

    if (game.stock.par && game.stock.par.values) {
      items["par"] = `${filename}-par.pdf`;
      items["par?paginated=true"] = `${filename}-par-paginated.pdf`;
    }
  }

  if (game.tiles) {
    items["tile-manifest"] = `${filename}-tile-manifest.pdf`;

    if (config.export.allLayouts) {
      forEach((layout) => {
        items[`tiles?config.tiles.layout=${layout}`] =
          `${filename}-tiles-${layout}.pdf`;
      }, schema.properties.tiles.properties.layout.enum);
    } else {
      items["tiles"] = `${filename}-tiles.pdf`;
    }
  }

  return items;
};
