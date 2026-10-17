export default function MapTerrain() {
  return (
    <svg
      viewBox="0 0 900 480"
      preserveAspectRatio="xMidYMid slice"
      className="terrain"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="blocks"
          width="94"
          height="70"
          patternTransform="rotate(-18)"
          patternUnits="userSpaceOnUse"
        >
          <rect
            x="8"
            y="8"
            width="70"
            height="48"
            rx="4"
            fill="var(--map-block)"
            stroke="var(--map-line)"
            strokeWidth="1"
          />
          <path
            d="M0 66H94 M88 0V70"
            stroke="var(--map-line)"
            strokeWidth="3"
          />
        </pattern>
        <pattern id="fine" width="22" height="22" patternUnits="userSpaceOnUse">
          <path
            d="M22 0H0v22"
            fill="none"
            stroke="var(--map-line)"
            strokeWidth=".5"
          />
        </pattern>
      </defs>
      <rect width="900" height="480" fill="var(--map-ground)" />
      <rect width="900" height="480" fill="url(#blocks)" opacity=".65" />
      <path
        d="M-30 60 180 100 240 45 410 82 480 30 620 50 740-10 M-30 390 160 340 300 380 460 310 650 390 940 320"
        stroke="var(--map-park)"
        strokeWidth="30"
        fill="none"
        opacity=".45"
      />
      <path
        d="M-40 70 180 110 240 55 410 92 480 40 620 60 740 0 M-30 390 160 340 300 380 460 310 650 390 940 320"
        stroke="var(--map-line)"
        strokeWidth="2"
        fill="none"
        opacity=".4"
      />
      <path
        d="M540-30C430 40 535 120 450 180S370 240 430 300 360 370 260 510"
        stroke="var(--bg)"
        strokeWidth="57"
        fill="none"
      />
      <path
        d="M540-30C430 40 535 120 450 180S370 240 430 300 360 370 260 510"
        stroke="var(--map-water)"
        strokeWidth="42"
        fill="none"
      />
      <path
        d="M540-30C430 40 535 120 450 180S370 240 430 300 360 370 260 510"
        stroke="var(--map-water-detail)"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="m80 40 280 10 60 160-120 90-260-50Z M550 65l270-20 40 190-270 30-95-95Z M520 300l310-30 10 180-380 20Z"
        fill="url(#fine)"
        stroke="var(--low)"
        strokeDasharray="5 7"
        strokeOpacity=".45"
      />
      <path
        d="M-10 260 200 220 420 230 640 170 920 190 M190-10 220 210 300 490 M740-10 665 210 720 500"
        fill="none"
        stroke="var(--map-line)"
        strokeWidth="6"
        opacity=".4"
      />
      <path
        d="M-10 260 200 220 420 230 640 170 920 190 M190-10 220 210 300 490 M740-10 665 210 720 500"
        fill="none"
        stroke="var(--map-road)"
        strokeWidth="1"
        opacity=".35"
      />
      <g fill="var(--muted)" fontSize="12" fontFamily="Inter, sans-serif">
        <text x="148" y="132">
          KOLHAPUR
        </text>
        <text x="635" y="108">
          SANGLI
        </text>
        <text x="585" y="408">
          MIRAJ
        </text>
        <text x="63" y="350">
          Radhanagari
        </text>
        <text x="350" y="75" fill="var(--text)" letterSpacing="3">
          ZONE A
        </text>
        <text x="732" y="250" fill="var(--text)" letterSpacing="3">
          ZONE B
        </text>
        <text x="500" y="365" fill="var(--text)" letterSpacing="3">
          ZONE C
        </text>
        <text
          x="458"
          y="280"
          fill="var(--medium)"
          transform="rotate(-54 458 280)"
        >
          Panchganga River
        </text>
      </g>
    </svg>
  )
}
