// Title text helpers.

const LINE = 12; // characters per title line at font size 9

// Word-wrap into at most `lines` lines; only the very end gets an ellipsis.
export function wrap(text, lines, width = LINE) {
  const out = [];
  let rest = text.trim();
  while (rest && out.length < lines) {
    if (rest.length <= width) {
      out.push(rest);
      rest = '';
      break;
    }
    let cut = rest.lastIndexOf(' ', width);
    if (cut < width / 2) cut = width;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest && out.length) out[out.length - 1] = `${out[out.length - 1].slice(0, width - 1)}…`;
  return out;
}
