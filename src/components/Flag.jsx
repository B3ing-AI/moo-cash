/**
 * Country flags drawn as SVG.
 *
 * Windows has no glyphs for regional-indicator emoji, so "🇮🇳" renders as
 * the letters IN on a large share of machines. Drawing them keeps the UI
 * identical everywhere and works offline.
 */
const FLAGS = {
  IN: <><rect width="60" height="13.3" fill="#FF9933" /><rect y="13.3" width="60" height="13.4" fill="#fff" /><rect y="26.7" width="60" height="13.3" fill="#138808" /><circle cx="30" cy="20" r="5.2" fill="none" stroke="#008" strokeWidth="1.3" /><circle cx="30" cy="20" r="1" fill="#008" /></>,
  KH: <><rect width="60" height="40" fill="#032EA1" /><rect y="10" width="60" height="20" fill="#E00025" /><path d="M24 25h12v2.5H24zM26.5 17h7v8h-7zM30 12.5l4.5 4.5h-9z" fill="#fff" /></>,
  ID: <><rect width="60" height="20" fill="#CE1126" /><rect y="20" width="60" height="20" fill="#fff" /></>,
  PH: <><rect width="60" height="20" fill="#0038A8" /><rect y="20" width="60" height="20" fill="#CE1126" /><path d="M0 0l26 20L0 40z" fill="#fff" /><circle cx="8.5" cy="20" r="4.2" fill="#FCD116" /></>,
  VN: <><rect width="60" height="40" fill="#DA251D" /><path d="M30 9.5l3.9 12h12.6l-10.2 7.4 3.9 12L30 33.5l-10.2 7.4 3.9-12-10.2-7.4h12.6z" fill="#FF0" /></>,
  SG: <><rect width="60" height="20" fill="#ED2939" /><rect y="20" width="60" height="20" fill="#fff" /><circle cx="14" cy="10" r="7" fill="#fff" /><circle cx="17.5" cy="10" r="6" fill="#ED2939" /></>,
  MY: <><rect width="60" height="40" fill="#fff" /><rect width="60" height="5.7" fill="#CC0001" /><rect y="11.4" width="60" height="5.7" fill="#CC0001" /><rect y="22.8" width="60" height="5.7" fill="#CC0001" /><rect y="34.2" width="60" height="5.7" fill="#CC0001" /><rect width="30" height="22.8" fill="#010066" /><circle cx="12.5" cy="11" r="6" fill="#FC0" /><circle cx="15.5" cy="11" r="5" fill="#010066" /></>,
  TH: <><rect width="60" height="40" fill="#A51931" /><rect y="6.7" width="60" height="26.6" fill="#F4F5F8" /><rect y="13.3" width="60" height="13.4" fill="#2D2A4A" /></>,
  CN: <><rect width="60" height="40" fill="#DE2910" /><path d="M12 6.5l2.4 7.4h7.8l-6.3 4.6 2.4 7.4L12 21.3l-6.3 4.6 2.4-7.4L1.8 13.9h7.8z" fill="#FFDE00" /></>,
  NG: <><rect width="20" height="40" fill="#008751" /><rect x="20" width="20" height="40" fill="#fff" /><rect x="40" width="20" height="40" fill="#008751" /></>,
  KE: <><rect width="60" height="40" fill="#fff" /><rect width="60" height="11" fill="#000" /><rect y="14" width="60" height="12" fill="#B00" /><rect y="29" width="60" height="11" fill="#060" /><ellipse cx="30" cy="20" rx="5.5" ry="11" fill="#B00" stroke="#fff" strokeWidth="1.6" /></>,
  GH: <><rect width="60" height="13.3" fill="#CE1126" /><rect y="13.3" width="60" height="13.4" fill="#FCD116" /><rect y="26.7" width="60" height="13.3" fill="#006B3F" /><path d="M30 14.5l2.2 6.6h7l-5.6 4.1 2.1 6.6-5.7-4-5.7 4 2.1-6.6-5.6-4.1h7z" fill="#000" /></>,
  ZA: <><rect width="60" height="20" fill="#002395" /><rect y="20" width="60" height="20" fill="#DE3831" /><path d="M0 0l30 20L0 40z" fill="#007A4D" /><path d="M0 6.5l20.5 13.5L0 33.5z" fill="#fff" /><path d="M0 12l12 8L0 28z" fill="#FFB612" /></>,
  TZ: <><rect width="60" height="40" fill="#1EB53A" /><path d="M60 4v36H14z" fill="#00A3DD" /><path d="M0 40L60 0h-9L0 34z" fill="#FCD116" /><path d="M0 34L51 0h-8L0 28z" fill="#000" /></>,
  BR: <><rect width="60" height="40" fill="#009C3B" /><path d="M30 5l24 15-24 15L6 20z" fill="#FFDF00" /><circle cx="30" cy="20" r="8.5" fill="#002776" /></>,
  AR: <><rect width="60" height="13.3" fill="#74ACDF" /><rect y="13.3" width="60" height="13.4" fill="#fff" /><rect y="26.7" width="60" height="13.3" fill="#74ACDF" /><circle cx="30" cy="20" r="4.2" fill="#F6B40E" /></>,
  VE: <><rect width="60" height="13.3" fill="#FC0" /><rect y="13.3" width="60" height="13.4" fill="#00247D" /><rect y="26.7" width="60" height="13.3" fill="#CF142B" /></>,
  CO: <><rect width="60" height="20" fill="#FCD116" /><rect y="20" width="60" height="10" fill="#003893" /><rect y="30" width="60" height="10" fill="#CE1126" /></>,
  EC: <><rect width="60" height="20" fill="#FD0" /><rect y="20" width="60" height="10" fill="#034EA2" /><rect y="30" width="60" height="10" fill="#ED1C24" /></>,
  PE: <><rect width="20" height="40" fill="#D91023" /><rect x="20" width="20" height="40" fill="#fff" /><rect x="40" width="20" height="40" fill="#D91023" /></>,
};

export default function Flag({ cc, size = 38, style }) {
  return (
    <span className="flag" style={{ width: size, height: size, ...style }}>
      <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {FLAGS[cc] || <rect width="60" height="40" fill="#D9D2C0" />}
      </svg>
    </span>
  );
}

export { FLAGS };
