import { diff } from "deep-object-diff";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router";

import { assocPath, defaultTo, mergeDeepRight } from "ramda";

import { useGame, useValidation } from "@/hooks";
import { createResetConfig, createSetConfig } from "@/state";

const configs = import.meta.glob("../*.json", {
  eager: true,
  import: "default",
});
const defaultConfig = configs["../defaults.json"];
const userConfig = configs["../config.json"] || {};
const initialConfig = mergeDeepRight(defaultConfig, userConfig);

const buildConfig = (storedConfig, search, game) => {
  const searchParams = new URLSearchParams(search);

  const preSearchConfig = mergeDeepRight(initialConfig, storedConfig);

  // Add Search config in
  let searchConfig = {};
  for (let [key, value] of searchParams.entries()) {
    let [head, ...path] = key.split(".");
    if (head === "config" && path.length > 0) {
      searchConfig = assocPath(path, value, searchConfig);
    }
  }
  const preGameConfig = mergeDeepRight(preSearchConfig, searchConfig);

  // Add Game config in
  const gameConfig = defaultTo({}, game && game.config);
  const config = mergeDeepRight(preGameConfig, gameConfig);

  return { config, searchConfig, gameConfig };
};

// useConfig is called by nearly every rendered element (every <Color />, for a
// start), so the merges above used to run thousands of times per render and
// hand back a new config object every time. The inputs are global, so cache the
// last result at module level: this keeps it to one merge per actual change and
// gives consumers a stable identity to memoize on.
let configCache = null;
const getConfig = (storedConfig, search, game) => {
  if (
    configCache &&
    configCache.storedConfig === storedConfig &&
    configCache.search === search &&
    configCache.game === game
  ) {
    return configCache.result;
  }

  const result = buildConfig(storedConfig, search, game);
  configCache = { storedConfig, search, game, result };
  return result;
};

export const useConfig = () => {
  const dispatch = useDispatch();
  const game = useGame();
  const location = useLocation();
  const { validateConfigSchema } = useValidation();

  const storedConfig = useSelector((state) => state.config);

  const { config, searchConfig, gameConfig } = getConfig(
    storedConfig,
    location.search,
    game,
  );

  const setConfig = useCallback(
    async (config) => {
      const errors = await validateConfigSchema(config);

      if (!errors.length) {
        return dispatch(createSetConfig(diff(initialConfig, config)));
      }
    },
    [dispatch, validateConfigSchema],
  );

  return {
    setConfig,
    resetConfig: useCallback(() => dispatch(createResetConfig()), [dispatch]),
    config,
    defaultConfig,
    userConfig,
    searchConfig,
    gameConfig,
    storedConfig,
  };
};
