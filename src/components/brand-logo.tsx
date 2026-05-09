import logo from "@/assets/wyngo-logo.png";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

export function BrandLogo({
  size = 36,
  showWordmark = true,
  className,
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img
        src={logo}
        alt="Wyngo"
        width={size}
        height={size}
        className="rounded-md shadow-sm ring-1 ring-border/40 object-cover"
        style={{ width: size, height: size }}
      />
      {showWordmark && (
        <div className={cn("flex flex-col leading-none", wordmarkClassName)}>
          <span className="font-bold tracking-wide text-foreground">WYNGO</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary">
            CRM
          </span>
        </div>
      )}
    </div>
  );
}
