import ExportPreview from "@/components/ExportPreview";
import PrintActions from "@/components/PrintActions";
import Toolbar from "@/components/Toolbar";
import Config from "@/components/config/Config";

import { useConfig } from "@/hooks";
import { useBooleanParam } from "@/util/query";

const Viewport = ({ children }) => {
  const [configOpen] = useBooleanParam("config");
  const { config } = useConfig();

  // Cards and charters are html, so their dieline is drawn by css (an outline
  // on the trim box) rather than by the export overlay; that way it is part
  // of the page and comes through the print / Save as PDF path as a vector.
  const dieline = config.export.dieline ? " export-dieline" : "";

  return (
    <div
      id="viewport"
      className={`editor-checkered print:bg-none print:bg-white select-none overscroll-none${dieline}`}
    >
      <Toolbar />
      <PrintActions />
      <ExportPreview />
      {configOpen && <Config />}
      <div id="viewport-children">{children}</div>
    </div>
  );
};

export default Viewport;
