/**
 * The Greenscape mark: a G drawn as an open ring with a leaf growing from its bar. Both take the text colour unless
 * `leaf` gives the leaf its own (lime on the green tiles). Artwork from scripts/brand-assets.mjs (packages/branding/logos/greenscape-mark.svg).
 */
export function BrandMark({ className, leaf = 'fill-current' }: { className?: string; leaf?: string }) {
  return (
    <svg viewBox="52 52 408 408" aria-hidden className={className}>
      <path fill="none" stroke="currentColor" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round" d="M306.68 100.03A164 164 0 1 0 420 256L286 256" />
      <path className={leaf} fillRule="evenodd" transform="translate(274 244) rotate(40)" d="M0 0C-70 -63.28 -60.2 -171.76 0 -226C60.2 -171.76 70 -63.28 0 0ZM-8.47 -36.16L-8.47 -135.6A8.47 8.47 0 0 1 8.47 -135.6L8.47 -36.16A8.47 8.47 0 0 1 -8.47 -36.16Z" />
    </svg>
  );
}
