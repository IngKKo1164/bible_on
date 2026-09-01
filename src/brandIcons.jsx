import React, { useId } from 'react';

export function BibleOnLogo({ size = 52, className = '', ...props }) {
  const clipId = `bibleon-logo-${useId().replace(/:/g, '')}`;

  return (
    <svg className={`bibleon-logo ${className}`.trim()} width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="60" height="60" rx="15" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="2" y="2" width="60" height="60" fill="#a59ac9" />
        <path d="M39 2H62V62H24L39 2Z" fill="#4b4298" />
      </g>
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="14.25" stroke="#37306f" strokeOpacity="0.18" strokeWidth="1.5" />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M18 14.5C18 11.46 20.46 9 23.5 9H35C43.7 9 49 13.62 49 21.2C49 26.15 46.5 29.72 42.25 31.55C47.4 33.2 50.5 37.15 50.5 42.55C50.5 50.52 44.73 55 35.15 55H23.5C20.46 55 18 52.54 18 49.5V14.5ZM28 18V27.5H34.2C37.85 27.5 39.8 25.85 39.8 22.7C39.8 19.62 37.85 18 34.2 18H28ZM28 36V46H35C39.05 46 41.25 44.27 41.25 40.95C41.25 37.65 39.05 36 35 36H28Z"
      />
    </svg>
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
