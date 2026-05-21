interface PageHeroProps {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  compact?: boolean;
}

export function PageHero({ title, subtitle, backgroundImage, compact }: PageHeroProps) {
  return (
    <section
      className={`relative flex items-center justify-center text-center overflow-hidden ${compact ? "py-8 md:py-20" : "py-12 md:py-28"}`}
      style={
        backgroundImage
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.45)), url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {!backgroundImage && (
        <div className="absolute inset-0 bg-foreground" />
      )}
      <div className="relative z-10 container mx-auto px-4">
        <h1 className="text-2xl md:text-5xl font-bold text-primary-foreground tracking-brand uppercase mb-2 md:mb-3">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs md:text-base text-primary-foreground/80 max-w-xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
