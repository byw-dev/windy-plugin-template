/**
 * Polling State Store - 管理轮询状态
 */
import { writable } from 'svelte/store';
import type { PlaneTrack } from '../pluginTypes';

// 是否正在轮询
export const isPolling = writable(false);

// 是否正在获取数据
export const isFetching = writable(false);

// 上次成功获取数据的时间
export const lastFetchOk = writable(false);

// 是否跟踪飞机
export const centerOnPlane = writable(false);

// 最新位置
export const latestPosition = writable<[number, number] | null>(null);

// 当前完整的轨迹数据对象 (支持更丰富的UI显示)
export const currentTrackData = writable<PlaneTrack | null>(null);

// 重置轮询状态
export function resetPollingState(): void {
    isPolling.set(false);
    isFetching.set(false);
}

// 设置获取状态
export function setFetching(fetching: boolean): void {
    isFetching.set(fetching);
}

// 设置轮询状态
export function setPolling(polling: boolean): void {
    isPolling.set(polling);
}
