/**
 * GeoJSON Service - GeoJSON 数据加载服务
 */
import { map } from '@windy/map';
import { writable, get } from 'svelte/store';

// GeoJSON 加载状态
export const isGeoJsonLoaded = writable(false);

// 已加载的 GeoJSON 图层引用
let geoJsonLayers: L.GeoJSON[] = [];

/**
 * 根据缩放级别计算圆形标记半径
 */
function calcCircleRadius(): number {
    const currentZoom = map.getZoom();
    return Math.max(2, 8 * (currentZoom / 10));
}

function createCircleIcon(radius: number, color: string): L.DivIcon {
    const size = radius * 2;
    return new L.DivIcon({
        className: 'uav-circle-icon',
        html: `<div style="
            width: ${size}px;
            height: ${size}px;
            background-color: ${color};
            border-radius: 50%;
            border: 2px solid ${color};
            opacity: 0.8;
            box-sizing: border-box;"></div>`,
        iconSize: [size, size],
        iconAnchor: [radius, radius]
    });
}

/**
 * 加载 GeoJSON 断言数据
 */
export async function loadAsserts(baseURL: string, uavAssertID: string): Promise<void> {
    if (get(isGeoJsonLoaded)) {
        unloadAsserts();
        return;
    }

    const apiURL = `${baseURL}/geojson/${uavAssertID}`;
    const resp = await fetch(apiURL);
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    const data = await resp.json();

    // 处理 GeoJSON 数据
    const layer = new L.GeoJSON(data, {
        // Prevents crash in some Leaflet versions when style is undefined
        style: () => ({}),
        pointToLayer: (feature, latlng) => {
            const radius = calcCircleRadius();
            const color = feature.properties.color || 'rgba(0, 255, 0, 0.5)';
            return new L.Marker(latlng, {
                icon: createCircleIcon(radius, color)
            });
        },
        onEachFeature: (feature, layer) => {
            if (feature.properties && feature.properties.name) {
                if (feature.geometry.type === 'Point') {
                    layer.bindTooltip(feature.properties.name, {
                        sticky: true,
                        direction: 'right',
                        offset: [10, 0],
                    });
                }
            }
        },
    }).addTo(map);

    geoJsonLayers.push(layer);
    isGeoJsonLoaded.set(true);

    // 动态调整 Marker 的大小
    map.on('zoomend', handleZoomEnd);

    // 按 GeoJson 里的第一个 Point 点居中显示地图
    if (data.features && data.features.length > 0) {
        const firstPoint = data.features.find((f: any) => f.geometry.type === 'Point');
        if (firstPoint) {
            const [lon, lat] = firstPoint.geometry.coordinates;
            const currentZoom = map.getZoom();
            if (currentZoom < 8) {
                map.setView(new L.LatLng(lat, lon), 8);
            } else {
                map.setView(new L.LatLng(lat, lon), currentZoom);
            }
        }
    }
}

/**
 * 处理缩放事件
 */
function handleZoomEnd(): void {
    const newRadius = calcCircleRadius();

    geoJsonLayers.forEach(geoJsonLayer => {
        geoJsonLayer.eachLayer((layer: any) => {
            if (layer instanceof L.Marker) {
                const feature = layer.feature;
                const color = feature?.properties?.color || 'rgba(0, 255, 0, 0.5)';
                layer.setIcon(createCircleIcon(newRadius, color));
            }
        });
    });
}

/**
 * 卸载 GeoJSON 数据
 */
export function unloadAsserts(): void {
    // 移除所有 GeoJSON 图层
    geoJsonLayers.forEach(layer => {
        map.removeLayer(layer);
    });
    geoJsonLayers = [];


    // 移除缩放事件监听
    map.off('zoomend', handleZoomEnd);

    isGeoJsonLoaded.set(false);
}
