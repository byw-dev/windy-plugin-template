/**
 * Track Service - 轨迹数据服务
 * 处理API调用和地图渲染逻辑
 */
import { map } from '@windy/map';
import { get } from 'svelte/store';
import { createPlaneIcon } from '../planeIcon';
import type { PlaneTrack, PlaneResult } from '../pluginTypes';
import {
    addTracks,
    getTracks,
    currentPlaneId,
} from '../stores/trackStore';
import {
    isPlaybackMode,
    effectiveIndex,
    updateToLatest,
} from '../stores/playbackStore';
import {
    isFetching,
    lastFetchOk,
    latestPosition,
    latestTrackInfo,
    setFetching,
} from '../stores/pollingStore';
import {
    simulationLayers,
    isSimulated,
} from '../stores/simulationStore';

// 地图图层存储
const PLANE_LAYER_STORE = new Map<string, L.Polyline>();

// 飞机标记
let planeMarker: L.Marker | null = null;
let currentMarkerPlaneId: string | null = null;

// 模拟图层组
const simulationLayerGroup = L.layerGroup();

// 常量：每度纬度对应的米数（近似值）
const METERS_PER_DEGREE_LAT = 111320;

// 常量：度数转弧度的转换因子
const DEG_TO_RAD = Math.PI / 180;

/**
 * 将轨迹数据转换为显示字符串
 */
export function trackToString(t: PlaneTrack | PlaneResult): string {
    if (!t) return 'No track data available.';
    const dt = new Date(t.timestamp * 1e3).toISOString().split('.')[0];
    return `        PlaneID: ${t.id}\n\n        Time: ${dt}\n\n        ${('duration' in t) ? `Duration: ${(t as any).duration}s\n` : ''}
        Lat: ${t.lat}°\n\n        Lon: ${t.lon}°\n\n        Alt: ${t.alt}m\n\n        Speed: ${t.speed}m/s\n\n        Heading: ${t.heading}°\n\n        `;
}

/**
 * 更新地图显示
 * @param isDragging - 是否正在拖动滑块（true时只移动飞机，不重绘轨迹线）
 * @param tracksOverride - 可选，直接传入轨迹数据（避免响应式延迟问题）
 * @param indexOverride - 可选，直接传入索引（避免响应式延迟问题）
 */
export function updateMapDisplay(
    isDragging = false,
    tracksOverride?: PlaneTrack[],
    indexOverride?: number
): void {
    const planeId = get(currentPlaneId);
    const tracks = tracksOverride || getTracks(planeId);
    if (tracks.length === 0) return;

    // 获取当前有效索引
    const idx = indexOverride !== undefined ? indexOverride : get(effectiveIndex);
    if (idx < 0 || idx >= tracks.length) return;

    const currentTrack = tracks[idx];

    // 更新飞机图标位置和朝向
    if (planeMarker) {
        planeMarker.setLatLng([currentTrack.lat, currentTrack.lon]);
        const el = planeMarker.getElement();
        if (el) {
            const rot = el.querySelector('.plane-rot') as HTMLElement | null;
            if (rot) {
                rot.style.transformOrigin = '50% 50%';
                rot.style.transform = `rotate(${currentTrack.heading}deg)`;
            }
        }
    }

    // 更新显示的航迹信息
    latestTrackInfo.set(trackToString(currentTrack));

    // 如果不是拖动中，重绘轨迹线
    if (!isDragging) {
        // 清除旧的轨迹线段
        PLANE_LAYER_STORE.forEach((segment) => {
            map.removeLayer(segment);
        });
        PLANE_LAYER_STORE.clear();

        // 渲染从0到当前索引的轨迹
        const trackPoints = tracks.slice(0, idx + 1).map(t => {
            const altitudeRatio = Math.min(t.alt / 6000, 1);
            const hue = (1 - altitudeRatio) * 120;
            const color = `hsl(${hue}, 100%, 50%)`;
            return {
                latLng: L.latLng(t.lat, t.lon, t.alt),
                color,
            };
        });

        trackPoints.reduce((prev, curr, i) => {
            if (prev) {
                const segment = L.polyline([prev.latLng, curr.latLng], {
                    color: prev.color,
                    weight: 2,
                });
                segment.addTo(map);
                PLANE_LAYER_STORE.set(`${planeId}_${i}`, segment);
            }
            return curr;
        }, null as { latLng: L.LatLng; color: string } | null);
    }

    // 更新最新位置
    latestPosition.set([currentTrack.lat, currentTrack.lon]);
    
    // 渲染模拟图层
    updateSimulationLayers(currentTrack.timestamp);
}

/**
 * 更新模拟图层显示
 * @param currentPlaybackTime - 当前回放时间戳
 */
function updateSimulationLayers(currentPlaybackTime: number): void {
    // 检查是否处于模拟状态
    const simulated = get(isSimulated);
    if (!simulated) {
        // 如果不在模拟状态，确保图层组被移除
        if (map.hasLayer(simulationLayerGroup)) {
            map.removeLayer(simulationLayerGroup);
        }
        return;
    }
    
    // 清空图层组
    simulationLayerGroup.clearLayers();
    
    // 获取模拟图层数据
    const layers = get(simulationLayers);
    
    // 遍历所有模拟图层
    for (const layer of layers) {
        // 只显示时间戳小于等于当前时间的图层
        if (layer.timestamp <= currentPlaybackTime) {
            // 计算时间差（秒）
            const deltaT = currentPlaybackTime - layer.timestamp;
            
            // 根据风速计算位移（米）
            const dx = layer.windVector.x * deltaT;
            const dy = layer.windVector.y * deltaT;
            
            // 计算纬度的余弦值（用于经度转换）
            const cosLat = Math.cos(layer.lat * DEG_TO_RAD);
            
            // 转换为经纬度偏移
            const latOffset = dy / METERS_PER_DEGREE_LAT;
            const lonOffset = dx / (METERS_PER_DEGREE_LAT * cosLat);
            
            // 计算新位置
            const newLat = layer.lat + latOffset;
            const newLon = layer.lon + lonOffset;
            
            // 将颜色转换为CSS格式
            const colorStr = `rgba(${Math.round(layer.color.r * 255)}, ${Math.round(layer.color.g * 255)}, ${Math.round(layer.color.b * 255)}, ${layer.color.a})`;
            
            // 创建圆圈
            const circle = L.circle([newLat, newLon], {
                radius: layer.radius,
                color: colorStr,
                fillColor: colorStr,
                fillOpacity: layer.color.a,
                weight: 1,
                opacity: layer.color.a
            });
            
            // 添加到图层组
            circle.addTo(simulationLayerGroup);
        }
    }
    
    // 确保图层组已添加到地图
    if (!map.hasLayer(simulationLayerGroup)) {
        simulationLayerGroup.addTo(map);
    }
}

/**
 * 确保飞机标记存在
 */
export function ensurePlaneMarker(planeId: string, position: [number, number]): void {
    // 若切换了飞机ID，移除旧标记
    if (currentMarkerPlaneId && currentMarkerPlaneId !== planeId && planeMarker) {
        map.removeLayer(planeMarker);
        planeMarker = null;
    }
    
    if (!planeMarker) {
        planeMarker = L.marker(L.latLng(position[0], position[1]), { icon: createPlaneIcon() });
        planeMarker.addTo(map);
        currentMarkerPlaneId = planeId;
    }
}

/**
 * 移除飞机标记
 */
export function removePlaneMarker(): void {
    if (planeMarker) {
        map.removeLayer(planeMarker);
        planeMarker = null;
        currentMarkerPlaneId = null;
    }
}

/**
 * 清除所有轨迹图层
 */
export function clearTrackLayers(): void {
    PLANE_LAYER_STORE.forEach((segment) => {
        map.removeLayer(segment);
    });
    PLANE_LAYER_STORE.clear();
}

/**
 * 获取飞机轨迹数据
 */
export async function fetchPlaneTrack(baseURL: string, flightID_planeID: string): Promise<boolean> {
    if (get(isFetching)) return false;

    setFetching(true);

    try {
        // 如果 flightID_planeID 中包含特殊字符反斜杠 '\'，需要进行编码
        let trackFilename = flightID_planeID;
        if (flightID_planeID.includes('\\')) {
            trackFilename = encodeURIComponent(flightID_planeID);
        }
        
        const apiURL = `${baseURL}/track/${trackFilename}/all`;
        const previousTracks = getTracks(flightID_planeID);
        const lastTrack = previousTracks.length > 0 ? previousTracks[previousTracks.length - 1] : null;
        
        console.log('Fetching from', apiURL, 'with last track', lastTrack);
        const lastDtParam = lastTrack ? `?last_dt=${new Date(lastTrack.timestamp * 1e3).toISOString().split('.')[0]}` : '';
        const resp = await fetch(apiURL + lastDtParam);

        if (!resp.ok) {
            lastFetchOk.set(false);
            return false;
        }

        const data: PlaneResult = await resp.json();
        const tracks = (data.tracks || []) as PlaneTrack[];

        let allTracks = previousTracks;
        if (tracks.length > 0) {
            allTracks = addTracks(flightID_planeID, tracks);
        }

        latestTrackInfo.set(trackToString(data));
        lastFetchOk.set(true);

        // 如果不在回放模式，更新显示
        const $isPlaybackMode = get(isPlaybackMode);
        if (!$isPlaybackMode) {
            // 更新到最新点
            updateToLatest(allTracks.length - 1);
            
            // 确保飞机标记存在
            if (allTracks.length > 0) {
                const last = allTracks[allTracks.length - 1];
                latestPosition.set([last.lat, last.lon]);
                ensurePlaneMarker(flightID_planeID, [last.lat, last.lon]);
            }

            // 更新地图显示
            updateMapDisplay(false, allTracks, allTracks.length - 1);
        } else {
            // 回放模式下，只确保飞机标记存在
            if (allTracks.length > 0 && !planeMarker) {
                const last = allTracks[allTracks.length - 1];
                ensurePlaneMarker(flightID_planeID, [last.lat, last.lon]);
            }
        }

        return tracks.length > 0;
    } catch (e: any) {
        console.error('Fetch failed:', e);
        lastFetchOk.set(false);
        return false;
    } finally {
        setFetching(false);
    }
}
