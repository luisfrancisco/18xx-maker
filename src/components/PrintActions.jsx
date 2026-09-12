import { useTranslation } from "react-i18next";
import { useLocation, useMatch } from "react-router";

import { assocPath } from "ramda";

import {
  FileDown,
  FileImage,
  Frame,
  Images,
  Printer,
  Scissors,
  SquareDashed,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useConfig, useGame } from "@/hooks";
import { trackEvent } from "@/util/analytics";
import capability from "@/util/capability";
import { pdfItems, pngItems } from "@/util/export";
import { downloadPdf, isDomSection } from "@/util/pdf";
import { useBooleanParam } from "@/util/query";

const Tip = ({ label, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="left">{label}</TooltipContent>
  </Tooltip>
);

const ActionButton = ({ label, onClick, children }) => (
  <Tip label={label}>
    <Button
      variant="outline"
      size="icon"
      className="h-10 w-10 rounded-full shadow"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  </Tip>
);

const OptionToggle = ({ label, pressed, onPressedChange, children }) => (
  <Tip label={label}>
    <Toggle
      variant="outline"
      size="sm"
      className="h-8 w-8 p-0 rounded-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      aria-label={label}
      pressed={pressed}
      onPressedChange={onPressedChange}
    >
      {children}
    </Toggle>
  </Tip>
);

// The print / download stack in the bottom right of every game element page.
// Replaces the MUI PrintButton and ExportButton from before the shadcn UI.
const PrintActions = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const game = useGame();
  const { config, setConfig } = useConfig();
  const [print] = useBooleanParam("print");
  const match = useMatch("/games/:slug/:section/*");

  if (print || !game || !match || match.params.section === "b18") {
    return null;
  }

  const section = match.params.section;
  const exportConfig = config.export;
  const path = location.pathname + location.search;

  const toggleOption = (key) => (pressed) =>
    setConfig(assocPath(["export", key], pressed, config));

  const onPrint = () => {
    trackEvent("print", location);
    window.print();
  };

  // Cards, charters and the tile manifest are html, not svg, so they can't go
  // through the vector exporter: the desktop app prints them to PDF natively
  // and the browser uses its print dialog.
  const printNatively = () => {
    if (capability.electron) {
      trackEvent("exportComponent", location, { media: "pdf" });
      window.api.pdf(path);
    } else {
      window.print();
    }
  };

  const onPdf = async () => {
    if (isDomSection(section)) {
      printNatively();
      return;
    }

    trackEvent("downloadPdf", location, {
      section,
      bleed: exportConfig.bleed,
      dieline: exportConfig.dieline,
      cropMarks: exportConfig.cropMarks,
    });

    const saved = await downloadPdf({
      game,
      config,
      section,
      search: location.search,
      options: exportConfig,
    });

    if (!saved) {
      printNatively();
    }
  };

  const onPng = () => {
    trackEvent("exportComponent", location, { media: "png" });
    window.api.png(path);
  };

  const onAllPdf = () => {
    trackEvent("exportGame", location, { media: "pdf" });
    window.api.exportPDF(game.meta.slug, pdfItems(game, config));
  };

  const onAllPng = () => {
    trackEvent("exportGame", location, { media: "png" });
    window.api.exportPNG(game.meta.slug, pngItems(game, config));
  };

  const pdfLabel = isDomSection(section)
    ? t("export.printDialog")
    : t("export.downloadPdf");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="z-40 print:hidden fixed bottom-6 right-6 flex flex-col items-end gap-2">
        <div className="flex flex-row items-center gap-1 rounded-sm border bg-background p-1 shadow">
          <span className="px-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            PDF
          </span>
          <OptionToggle
            label={t("export.bleed")}
            pressed={exportConfig.bleed}
            onPressedChange={toggleOption("bleed")}
          >
            <Frame className="size-4" />
          </OptionToggle>
          <OptionToggle
            label={t("export.cropMarks")}
            pressed={exportConfig.cropMarks}
            onPressedChange={toggleOption("cropMarks")}
          >
            <SquareDashed className="size-4" />
          </OptionToggle>
          <OptionToggle
            label={t("export.dieline")}
            pressed={exportConfig.dieline}
            onPressedChange={toggleOption("dieline")}
          >
            <Scissors className="size-4" />
          </OptionToggle>
        </div>
        {capability.electron && (
          <>
            <ActionButton label={t("export.allPdf")} onClick={onAllPdf}>
              <Images className="size-5" />
            </ActionButton>
            <ActionButton label={t("export.allPng")} onClick={onAllPng}>
              <FileImage className="size-5" />
            </ActionButton>
            <ActionButton label={t("export.singlePng")} onClick={onPng}>
              <FileImage className="size-5" />
            </ActionButton>
          </>
        )}
        <ActionButton label={pdfLabel} onClick={onPdf}>
          <FileDown className="size-5" />
        </ActionButton>
        <ActionButton label={t("export.print")} onClick={onPrint}>
          <Printer className="size-5" />
        </ActionButton>
      </div>
    </TooltipProvider>
  );
};

export default PrintActions;
