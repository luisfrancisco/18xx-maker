import bitterBold from "@/fonts/Bitter-Bold.ttf?url";
import bitterBoldItalic from "@/fonts/Bitter-BoldItalic.ttf?url";
import bitterItalic from "@/fonts/Bitter-Italic.ttf?url";
import bitterRegular from "@/fonts/Bitter-Regular.ttf?url";
import colorblindSymbols from "@/fonts/ColorblindSymbols.ttf?url";

// Font name used in the svg / pdf for the display face
export const DISPLAY_FONT = "Bitter";

// Font family for tile ids with colorblind symbols (⏷ ⏹ ⏺ ✱ ★ ⨉ ⏶ 〜 plus
// printable ASCII), used as-is in the svg and registered under the same name
// in the pdf
export const COLORBLIND_FONT = "colorblind";

// The app's "display" face is Bitter, shipped to the browser as woff2, which
// jsPDF can't embed. These are the same faces as TTF; they are fetched the
// first time a PDF is made and registered on every document, so exported text
// uses the real font rather than Helvetica. The colorblind symbols get a small
// font of their own, since no standard PDF font has those glyphs.
const FACES = [
  { file: "Bitter-Regular.ttf", url: bitterRegular, style: "normal" },
  { file: "Bitter-Bold.ttf", url: bitterBold, style: "bold" },
  { file: "Bitter-Italic.ttf", url: bitterItalic, style: "italic" },
  { file: "Bitter-BoldItalic.ttf", url: bitterBoldItalic, style: "bolditalic" },
  {
    file: "ColorblindSymbols.ttf",
    url: colorblindSymbols,
    style: "normal",
    family: COLORBLIND_FONT,
  },
];

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

let loading = null;
const loadFaces = () => {
  if (!loading) {
    loading = Promise.all(
      FACES.map(async (face) => {
        const response = await fetch(face.url);
        if (!response.ok) {
          throw new Error(`Could not load ${face.file}`);
        }
        return { ...face, data: toBase64(await response.arrayBuffer()) };
      }),
    ).catch((error) => {
      loading = null;
      throw error;
    });
  }

  return loading;
};

// Registers the display font on a jsPDF document. If the font files can't be
// fetched the document falls back to the standard fonts.
export const registerFonts = async (doc) => {
  let faces;
  try {
    faces = await loadFaces();
  } catch (error) {
    console.warn("PDF fonts unavailable, using standard fonts", error);
    return false;
  }

  for (const face of faces) {
    doc.addFileToVFS(face.file, face.data);
    doc.addFont(face.file, face.family || DISPLAY_FONT, face.style);
  }

  return true;
};
