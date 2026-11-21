import React, { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

export interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src?: string | null;
    alt?: string;
    className?: string;
    fallback?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLImageElement>;
}

export function ImageWithFallback({ src, alt, className, fallback, ...props }: ImageWithFallbackProps) {
    const [error, setError] = useState(false);

    if (error || !src) {
        return fallback ? (
            <>{fallback}</>
        ) : (
            <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
                <ImageIcon className="w-6 h-6 opacity-60" />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setError(true)}
            {...props}
        />
    );
}
