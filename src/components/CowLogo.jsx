/**
 * The moo.cash mark — a friendly Holstein face in a circle.
 * Drawn rather than an image so it stays crisp at any size and
 * needs no network request.
 */
export default function CowLogo({ size = 40, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="moo.cash"
      style={{ flex: 'none' }}
    >
      <circle cx="24" cy="24" r="22" fill="#FFFDF6" stroke="#1C1A17" strokeWidth="2.5" />

      {/* horns */}
      <path d="M15 15C13 10 10 9 7.5 11c.8 3 3.5 6 6.5 7z" fill="#8B6B3F" stroke="#1C1A17" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M33 15c2-5 5-6 7.5-4-.8 3-3.5 6-6.5 7z" fill="#8B6B3F" stroke="#1C1A17" strokeWidth="1.8" strokeLinejoin="round" />

      {/* ears */}
      <ellipse cx="10.5" cy="23" rx="5.5" ry="4" transform="rotate(-22 10.5 23)" fill="#FFFDF6" stroke="#1C1A17" strokeWidth="2.2" />
      <ellipse cx="37.5" cy="23" rx="5.5" ry="4" transform="rotate(22 37.5 23)" fill="#FFFDF6" stroke="#1C1A17" strokeWidth="2.2" />
      <ellipse cx="10.5" cy="23" rx="2.6" ry="1.8" transform="rotate(-22 10.5 23)" fill="#FFAEC0" />
      <ellipse cx="37.5" cy="23" rx="2.6" ry="1.8" transform="rotate(22 37.5 23)" fill="#FFAEC0" />

      {/* head */}
      <path d="M14 21c0-6.5 4.5-10 10-10s10 3.5 10 10c.6 5.5.6 10-2 13-3 3.2-13 3.2-16 0-2.6-3-2.6-7.5-2-13z"
            fill="#FFFDF6" stroke="#1C1A17" strokeWidth="2.5" strokeLinejoin="round" />

      {/* spots */}
      <path d="M26.5 12.4c3.8.5 6.4 3 7.3 6.6-3 1.2-5.6.2-7.3-2.4z" fill="#1C1A17" />
      <path d="M14.2 20.5c-.7 3.4 1.4 6.6 4.3 6.3 1.4-2.4 1-5.6-.6-6.9-1.6-1.2-3.3-.8-3.7.6z" fill="#1C1A17" />

      {/* eyes */}
      <circle cx="18.6" cy="24.4" r="2.3" fill="#FFFDF6" />
      <circle cx="18.6" cy="24.4" r="1.7" fill="#1C1A17" />
      <circle cx="19.2" cy="23.8" r=".6" fill="#FFFDF6" />
      <circle cx="30" cy="24.4" r="2.1" fill="#1C1A17" />
      <circle cx="30.6" cy="23.8" r=".65" fill="#FFFDF6" />

      {/* muzzle */}
      <ellipse cx="24" cy="32.6" rx="8.4" ry="5.6" fill="#FFAEC0" stroke="#1C1A17" strokeWidth="2.2" />
      <ellipse cx="21.2" cy="31.6" rx="1.25" ry="1.5" fill="#1C1A17" />
      <ellipse cx="26.8" cy="31.6" rx="1.25" ry="1.5" fill="#1C1A17" />
      <path d="M21.6 35.1q2.4 1.9 4.8 0" stroke="#1C1A17" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
