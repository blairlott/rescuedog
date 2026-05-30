import { useEffect, useRef, useState } from "react";

interface Props {
  /** Either provide a YouTube videoId... */
  videoId?: string;
  /** ...or a fully-formed embed URL (loop/autoplay params included). */
  embedUrl?: string;
  /** Optional poster image shown until the iframe loads. */
  posterUrl?: string;
  /** Accessible label (used as iframe title + img alt). */
  title?: string;
  ariaLabel?: string;
  className?: string;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
}

/** Loads the YouTube iframe only when scrolled into view — saves ~500KB on initial paint.
 *  Accepts either a raw `videoId` (built-in autoplay/loop URL) or a custom `embedUrl`. */
export function LazyYouTube({ videoId, embedUrl, posterUrl, title, ariaLabel, className, iframeRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!wrapRef.current || visible) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [visible]);

  const resolvedSrc =
    embedUrl ??
    (videoId
      ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=*`
      : null);
  const label = ariaLabel ?? title ?? "Video";

  return (
    <div ref={wrapRef} className={className}>
      {posterUrl && !visible && (
        <img
          src={posterUrl}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          decoding="async"
        />
      )}
      {visible && resolvedSrc && (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 w-full h-full scale-[1.5] pointer-events-none"
          src={resolvedSrc}
          title={label}
          loading="lazy"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      )}
    </div>
  );
}