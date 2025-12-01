/**
 * Track Data Store - 管理飞机轨迹数据的状态
 */
import { writable, derived, get } from 'svelte/store';
import type { PlaneTrack } from '../pluginTypes';

// 原始轨迹数据存储 (Map结构用于多飞机支持)
const trackMap = new Map<string, PlaneTrack[]>();

// 用于触发响应式更新的版本号
export const trackStoreVersion = writable(0);

// 当前选中的飞机ID
export const currentPlaneId = writable<string>('');

// 获取指定飞机的轨迹数据
export function getTracks(planeId: string): PlaneTrack[] {
    return trackMap.get(planeId) || [];
}

// 添加轨迹数据
export function addTracks(planeId: string, newTracks: PlaneTrack[]): PlaneTrack[] {
    const existing = trackMap.get(planeId) || [];
    existing.push(...newTracks);
    trackMap.set(planeId, existing);
    trackStoreVersion.update(v => v + 1);
    return existing;
}

// 清除指定飞机的轨迹数据
export function clearTracks(planeId: string): void {
    trackMap.delete(planeId);
    trackStoreVersion.update(v => v + 1);
}

// 清除所有轨迹数据
export function clearAllTracks(): void {
    trackMap.clear();
    trackStoreVersion.update(v => v + 1);
}

// 当前飞机的轨迹数据 (响应式)
export const currentTracks = derived(
    [currentPlaneId, trackStoreVersion],
    ([$planeId]) => getTracks($planeId)
);

// 轨迹数量
export const trackCount = derived(currentTracks, ($tracks) => $tracks.length);

// 是否有数据
export const hasTrackData = derived(trackCount, ($count) => $count > 0);

// 滑块最大值 (至少为0)
export const sliderMax = derived(trackCount, ($count) => Math.max(0, $count - 1));
