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
//
// postScriptName is each file's own PostScript name (name table ID 6), which
// is what the PDF has to call the font for Illustrator and other editors to
// match it with the installed font.
const FACES = [
  {
    file: "Bitter-Regular.ttf",
    url: bitterRegular,
    style: "normal",
    postScriptName: "Bitter-Regular",
  },
  {
    file: "Bitter-Bold.ttf",
    url: bitterBold,
    style: "bold",
    postScriptName: "Bitter-Bold",
  },
  {
    file: "Bitter-Italic.ttf",
    url: bitterItalic,
    style: "italic",
    postScriptName: "Bitter-Italic",
  },
  {
    file: "Bitter-BoldItalic.ttf",
    url: bitterBoldItalic,
    style: "bolditalic",
    postScriptName: "Bitter-BoldItalic",
  },
  {
    file: "ColorblindSymbols.ttf",
    url: colorblindSymbols,
    style: "normal",
    family: COLORBLIND_FONT,
    postScriptName: "ColorblindSymbols-Regular",
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

  const registered = faces.map((face) => {
    const family = face.family || DISPLAY_FONT;
    doc.addFileToVFS(face.file, face.data);
    doc.addFont(face.file, family, face.style);
    return {
      font: doc.internal.getFont(family, face.style),
      family,
      postScriptName: face.postScriptName,
    };
  });

  // jsPDF writes the family name the font was registered under ("Bitter",
  // "colorblind") as the font's name in the file, the same for every style.
  // Editors like Illustrator match fonts by PostScript name, so they couldn't
  // find these. Swap in the real PostScript names while the file is written,
  // then put the family names back, since jsPDF looks fonts up by them.
  doc.internal.events.subscribe("buildDocument", () => {
    for (const { font, postScriptName } of registered) {
      font.fontName = postScriptName;
    }
  });
  doc.internal.events.subscribe("postPutResources", () => {
    for (const { font, family } of registered) {
      font.fontName = family;
    }
  });

  return true;
};
