/**
 * Product illustrations for the ad templates: plain SVG drawn in code, so they never break and
 * scale to any size. Each art piece takes a few colour options; templates pass their own colours.
 */
export type ArtOpts = Record<string, string>;
export type Art = {
  /** viewBox width and height of the drawing (the image keeps this aspect ratio). */
  vb: [number, number];
  /** Default options (colours, variants). */
  defaults: ArtOpts;
  /** Inner SVG markup (everything that goes inside <svg>, including <defs>). */
  draw: (o: ArtOpts) => string;
};
