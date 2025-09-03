import { renderCode128BToSvg } from "../src/code128";

const text = process.argv[2] ?? "HELLO-128";

const svg = renderCode128BToSvg(text, {
  moduleWidth: 2,
  height: 80,
  quietZone: 10,
  background: "#fff",
  barColor: "#000",
  displayValue: true,
  fontFamily: "monospace",
  fontSize: 14,
  textMargin: 4,
});

// Print to stdout so it can be redirected to a file
process.stdout.write(svg);

