import { useState } from "react";

interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: string;
}

export function ArtworkImage({ src, alt, className, fallback = "/app-logo.png" }: ArtworkImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const resolvedSource = src && failedSource !== src ? src : fallback;
  return (
    <img
      className={className}
      src={resolvedSource}
      alt={alt}
      onError={() => {
        if (src && resolvedSource === src) setFailedSource(src);
      }}
    />
  );
}
