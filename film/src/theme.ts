// The site's own palette and faces. site/globals.css names the same families through CSS variables.
import { loadFont as bodoni } from "@remotion/google-fonts/BodoniModa";
import { loadFont as caveat } from "@remotion/google-fonts/Caveat";
import { loadFont as courier } from "@remotion/google-fonts/CourierPrime";
import { loadFont as instrument } from "@remotion/google-fonts/InstrumentSans";
import { loadFont as delafield } from "@remotion/google-fonts/MrsSaintDelafield";

bodoni("normal", { weights: ["500"], subsets: ["latin"] });
bodoni("italic", { weights: ["500"], subsets: ["latin"] });
instrument("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
courier("normal", { weights: ["400", "700"], subsets: ["latin"] });
caveat("normal", { weights: ["400"], subsets: ["latin"] });
delafield("normal", { weights: ["400"], subsets: ["latin"] });

export const C = {
  paper: "#e9ede1",
  paperDeep: "#dde3d3",
  sheet: "#f6f7ef",
  ink: "#17212b",
  soft: "#49555f",
  faint: "#7b858b",
  engrave: "#1f5a45",
  pen: "#1c3f9f",
  stop: "#b0281f",
  drawer: "#5c3b8e",
  rule: "rgba(23,33,43,.16)",
};

export const F = {
  display: "'Bodoni Moda', serif",
  text: "'Instrument Sans', sans-serif",
  typed: "'Courier Prime', monospace",
  hand: "'Caveat', cursive",
  autograph: "'Mrs Saint Delafield', cursive",
};

export const SITE = "countersign-ten-xi.vercel.app";
export const REPO = "github.com/Sanchay117/countersign";
