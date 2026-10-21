// JXA: draws one line of bold white text (emoji included) into a transparent PNG.
// osascript -l JavaScript text-image.js <text> <size> <minSize> <width> <height> <out.png>
// Shrinks from <size> to <minSize> to fit <width>, then truncates with an ellipsis.
ObjC.import('Cocoa');

function run(argv) {
  const [text, sizeArg, minArg, widthArg, heightArg, out] = argv;
  const W = +widthArg;
  const H = +heightArg;
  const attrs = (size) =>
    $.NSDictionary.dictionaryWithObjectsForKeys(
      $([$.NSFont.boldSystemFontOfSize(size), $.NSColor.whiteColor]),
      $([$.NSFontAttributeName, $.NSForegroundColorAttributeName]),
    );
  const measure = (str, size) => ({ str: $(str), at: attrs(size), size: $(str).sizeWithAttributes(attrs(size)) });
  let size = +sizeArg;
  let a = measure(text, size);
  while (a.size.width > W && size > +minArg) a = measure(text, --size);
  for (let s = [...text]; a.size.width > W && s.length > 1; ) {
    s.pop();
    a = measure(`${s.join('').trimEnd()}…`, size);
  }
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, W, H, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0,
  );
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  a.str.drawAtPointWithAttributes({ x: (W - a.size.width) / 2, y: (H - a.size.height) / 2 }, a.at);
  $.NSGraphicsContext.restoreGraphicsState;
  const PNG = 4; // NSBitmapImageFileTypePNG
  if (!rep.representationUsingTypeProperties(PNG, $.NSDictionary.dictionary).writeToFileAtomically(out, true)) throw new Error(`could not write ${out}`);
  return '';
}
