/** Shared dimensions of the painted boost pad in its local road frame. */
export const BOOST_PAD = {
  rows: 5,
  rowSpacing: 1.65,
  stripeWidth: 3.7,
  stripeDepth: 0.48,
  sideOffset: 1.4,
  angle: 0.46,
} as const;

/** Bounding rectangle of the rotated chevrons, including the gaps between
 * stripes. There is no invisible margin beyond the paint's outer edges. */
export const BOOST_PAD_BOUNDS = {
  halfWidth:
    BOOST_PAD.sideOffset +
    (Math.cos(BOOST_PAD.angle) * BOOST_PAD.stripeWidth) / 2 +
    (Math.sin(BOOST_PAD.angle) * BOOST_PAD.stripeDepth) / 2,
  halfLength:
    ((BOOST_PAD.rows - 1) * BOOST_PAD.rowSpacing) / 2 +
    (Math.sin(BOOST_PAD.angle) * BOOST_PAD.stripeWidth) / 2 +
    (Math.cos(BOOST_PAD.angle) * BOOST_PAD.stripeDepth) / 2,
};
