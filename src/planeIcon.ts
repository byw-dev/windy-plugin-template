export const createPlaneIcon = () => L.divIcon({
  html: `
  <div class="plane-icon">
    <div class="plane-rot" aria-hidden="true">
      <svg viewBox="0 0 28 28" width="28" height="28" xmlns="http://www.w3.org/2000/svg" role="img">
        <!-- 简化飞机剪影：默认朝上（北） -->
        <g fill="#ffd400" stroke="#000" stroke-width="1">
          <!-- 机头 -->
          <polygon points="14,2 16,8 12,8" />
          <!-- 机身 -->
          <rect x="12" y="8" width="4" height="12" rx="1" />
          <!-- 机翼左 -->
          <polygon points="2,14 12,11 12,15 2,18" />
          <!-- 机翼右 -->
          <polygon points="16,11 26,14 26,18 16,15" />
          <!-- 尾翼水平面 -->
          <polygon points="6,24 22,24 18,22 10,22" />
          <!-- 尾翼垂直面 -->
          <rect x="13" y="20" width="2" height="6" />
        </g>
        <!-- 轻微高光，可按需移除 -->
        <path d="M13.2 9 L14.8 9 L15.6 16 L12.4 16 Z" fill="#fff59d" opacity="0.4" />
      </svg>
    </div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  className: '' // keep empty to avoid Leaflet default styles overriding
});

