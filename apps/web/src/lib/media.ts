/**
 * The 2.0 demo video, rendered from the demo deck (scripts/render-deck.mjs).
 * `checkoutAt` is where the website purchase starts, in seconds: the
 * `checkout` row of the script written next to the video. Update both when
 * the video is rendered again.
 */
export const DEMO_VIDEO = {
  src: '/videos/tessera-2.0-demo.mp4',
  poster: '/videos/tessera-2.0-demo-poster.jpg',
  captions: '/videos/tessera-2.0-demo.vtt',
  length: '3:17',
  checkoutAt: 109,
} as const;
