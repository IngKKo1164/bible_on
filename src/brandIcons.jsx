import React from 'react';

const logoSources = {
  app: '/assets/brand/bibleon-app-icon.png',
  mark: '/assets/brand/bibleon-mark.png',
  white: '/assets/brand/bibleon-mark-white.png',
};

export function BibleOnLogo({ size = 52, variant = 'mark', className = '', alt = '', ...props }) {
  return (
    <img
      className={`bibleon-logo ${className}`.trim()}
      src={logoSources[variant] ?? logoSources.mark}
      width={size}
      height={size}
      alt={alt}
      draggable="false"
      decoding="async"
      {...props}
    />
  );
}

export function ChurchCrossIcon({ size = 24, strokeWidth = 2.7, className = '', ...props }) {
  return (
    <svg className={`lucide church-cross-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 3.2V20.8M7 8.5H17" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function BibleBookIcon({ size = 24, strokeWidth = 2.35, className = '', ...props }) {
  return (
    <svg className={`lucide bible-book-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3.5 5.5C6.8 4.55 9.6 5.25 12 7.35V20.2C9.55 18.35 6.72 17.85 3.5 18.9V5.5Z" fill="currentColor" opacity="0.12" />
      <path d="M20.5 5.5C17.2 4.55 14.4 5.25 12 7.35V20.2C14.45 18.35 17.28 17.85 20.5 18.9V5.5Z" fill="currentColor" opacity="0.12" />
      <path d="M3.5 5.5C6.8 4.55 9.6 5.25 12 7.35C14.4 5.25 17.2 4.55 20.5 5.5V18.9C17.28 17.85 14.45 18.35 12 20.2C9.55 18.35 6.72 17.85 3.5 18.9V5.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 7.35V20.2M4.2 21C7.1 20.15 9.7 20.55 12 22C14.3 20.55 16.9 20.15 19.8 21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SixteenthNoteIcon({ size = 24, strokeWidth = 2.2, className = '', ...props }) {
  return (
    <svg className={`lucide sixteenth-note-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <ellipse cx="7.7" cy="18.2" rx="3.35" ry="2.65" transform="rotate(-18 7.7 18.2)" fill="currentColor" />
      <path d="M10.5 17.4V4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M10.5 3.9C14.5 4.05 17.7 5.45 19.35 7.85L17.45 9.35C15.95 7.8 13.65 6.85 10.5 6.7V3.9Z" fill="currentColor" />
      <path d="M10.5 8.45C13.9 8.55 16.65 9.75 18.05 11.9L16.25 13.3C15 11.95 13.15 11.2 10.5 11.05V8.45Z" fill="currentColor" />
    </svg>
  );
}
