import { useEffect, useRef, useState } from "react";

interface Props {
  videoId: string;
  title: string;
  className?: string;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
}

/** Loads the YouTube iframe only when scrolled into view — saves ~500KB on initial paint. */
export function LazyYouTube({ videoId, title, className, iframeRef }: Props) {
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

  return (
    <div ref={wrapRef} className={className}>
      {visible && (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 w-full h-full scale-[1.5] pointer-events-none"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=*`}
          title={title}
          loading="lazy"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      )}
    </div>
  );
}