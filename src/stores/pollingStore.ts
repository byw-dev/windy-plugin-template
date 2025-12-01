/**
 * Polling State Store - 管理轮询状态
 */
import { writable } from 'svelte/store';

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

// 最新轨迹信息字符串
export const latestTrackInfo = writable<string>('无事发生');

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
