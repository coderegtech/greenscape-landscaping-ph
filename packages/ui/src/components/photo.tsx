import Image, { type ImageProps } from 'next/image';
import { cn } from '../lib/utils';

type PhotoProps = Omit<ImageProps, 'placeholder' | 'blurDataURL' | 'alt'> & {
  alt: string;
  /** From the CMS MediaRef (generated at upload). Without it the frame shows the paper step while loading. */
  blurDataUrl?: string;
  /** CSS aspect-ratio for the frame, e.g. "4 / 3". Reserves space so nothing shifts. */
  ratio?: string;
  caption?: string;
  frameClassName?: string;
};

/** Square, true-colour photograph with a 1px cream ring, a reserved frame and an optional caption below. */
export function Photo({ alt, blurDataUrl, ratio = '4 / 3', caption, className, frameClassName, sizes = '(min-width: 64rem) 50vw, 100vw', ...img }: PhotoProps) {
  const frame = (
    <div className={cn('photo-frame relative overflow-clip bg-paper-3', frameClassName)} style={{ aspectRatio: ratio }}>
      <Image
        alt={alt}
        fill={!img.width}
        sizes={sizes}
        placeholder={blurDataUrl ? 'blur' : 'empty'}
        blurDataURL={blurDataUrl}
        className={cn('object-cover', className)}
        {...img}
      />
    </div>
  );
  if (!caption) return frame;
  return (
    <figure className="flex flex-col gap-2">
      {frame}
      <figcaption className="label">{caption}</figcaption>
    </figure>
  );
}
