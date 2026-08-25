import Link from 'next/link';
import Image from 'next/image';

type BrandLogoProps = {
  className?: string;
  height?: number;
};

export function BrandLogo({ className = '', height = 56 }: BrandLogoProps) {
  // Source is 1536×1024 — keep aspect ratio for the nav mark
  const width = Math.round(height * (1536 / 1024));

  return (
    <Link href="/" className={`inline-flex items-center shrink-0 ${className}`}>
      <Image
        src="/brand/logo.png"
        alt="Brand logo"
        width={width}
        height={height}
        className="h-14 w-auto object-contain"
        priority
      />
    </Link>
  );
}
