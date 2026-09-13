import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { Link, useLocation, useMatch, useNavigate } from "react-router";

import { find, map, propEq } from "ramda";

import { ArrowBigLeft, Bolt, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";

import { useGame } from "@/hooks";
import { refreshGame } from "@/state";
import { trackEvent } from "@/util/analytics";
import capability from "@/util/capability";
import { useBooleanParam } from "@/util/query";

const gameNav = [
  {
    key: "1",
    section: "map",
    configSection: "maps",
    pagination: true,
  },
  {
    key: "2",
    section: "tiles",
    configSection: "tiles",
  },
  {
    key: "3",
    section: "tokens",
    configSection: "tokens",
  },
  {
    key: "4",
    section: "cards",
    configSection: "cards",
  },
  {
    key: "5",
    section: "charters",
    configSection: "charters",
  },
  {
    key: "6",
    section: "market",
    configSection: "stock",
    pagination: true,
  },
  {
    key: "7",
    section: "background",
    configSection: "layout",
  },
  {
    key: "8",
    section: "par",
    configSection: "stock",
    pagination: true,
  },
  {
    key: "9",
    section: "revenue",
    configSection: "stock",
    pagination: true,
  },
  {
    key: "m",
    section: "tile-manifest",
    configSection: "tiles",
  },
];

const Toolbar = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const [paginated, togglePagination] = useBooleanParam("paginated");
  const [config] = useBooleanParam("config");

  const game = useGame();
  const slug = game.meta.slug;

  const match = useMatch("/games/:slug/:section/*");
  const item = find(propEq(match.params.section, "section"), gameNav);

  // Opening the settings panel from a section jumps straight to that
  // section's config instead of always landing on Colors. Both params are
  // set through a single navigate call: setting them via two separate
  // useBooleanParam/useStringParam calls would each build their own copy of
  // the current search params and navigate independently, and the second
  // call would clobber the first's change.
  const onToggleConfig = () => {
    const searchParams = new URLSearchParams(location.search);

    if (config) {
      searchParams.delete("config");
    } else {
      searchParams.set("config", true);
      if (item.configSection) {
        searchParams.set("section", item.configSection);
      }
    }

    navigate({ search: searchParams.toString() });
  };

  const handleKeyDown = useCallback(
    (event) => {
      const tag = event.target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const item = find(propEq(event.key, "key"), gameNav);

      if (item) {
        navigate(`/games/${slug}/${item.section}`);
      }
    },
    [slug, navigate],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup the event listener on unmount
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  if (match.params.section === "b18") {
    return null;
  }

  const onRefresh = (event) => {
    event.preventDefault();
    trackEvent("refresh", location);
    dispatch(refreshGame());
  };

  return (
    <div className="z-40 print:hidden fixed top-4 left-4 rounded-sm border p-1 flex flex-row gap-0.5 bg-background justify-start items-center">
      <Button asChild variant="outline" className="p-2-px w-8 h-8 m-0">
        <Link to={`/games/${slug}`}>
          <ArrowBigLeft width="24" height="24" />
        </Link>
      </Button>
      <Separator orientation="vertical" />
      <Toggle
        onPressedChange={onToggleConfig}
        pressed={config}
        variant="outline"
        className="rounded-sm p-2 w-8 h-8 m-0"
      >
        <Bolt className="w-6 h-6" />
      </Toggle>
      {!capability.electron && game.meta.type === "system" && (
        <>
          <Separator orientation="vertical" />
          <Button
            variant="outline"
            className="border rounded-sm p-2 w-8 h-8 m-0"
            onClick={onRefresh}
          >
            <RefreshCw className="size-6" />
          </Button>
        </>
      )}
      <Separator orientation="vertical" />
      <Select
        value={item.section}
        onValueChange={(section) => navigate(`/games/${slug}/${section}`)}
        className="w-60"
      >
        <SelectTrigger>
          <SelectValue value={item.section} className="w-60" />
        </SelectTrigger>
        <SelectContent>
          {map((item) => {
            return (
              <SelectItem
                key={item.section}
                value={item.section}
                className="w-48 flex flex-row"
              >
                <span className="mr-2 italic">{item.key}:</span>
                {t(`game.nav.${item.section}`)}
              </SelectItem>
            );
          }, gameNav)}
        </SelectContent>
      </Select>
      {item.pagination && (
        <div className="ml-2 flex flex-row gap-2 justify-start items-center">
          <Label htmlFor="paginate-switch">Paginate</Label>
          <Switch
            id="paginate-switch"
            checked={paginated}
            onCheckedChange={togglePagination}
          />
        </div>
      )}
    </div>
  );
};

export default Toolbar;
