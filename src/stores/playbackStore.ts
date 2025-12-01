/**
 * Playback State Store - 管理回放状态
 */
import { writable, derived, get } from 'svelte/store';
import { sliderMax } from './trackStore';

// 是否处于回放模式 (false=实时模式, true=回放模式)
export const isPlaybackMode = writable(false);

// 当前播放索引
export const playbackIndex = writable(0);

// 是否正在播放
export const isPlaying = writable(false);

// 计算有效的播放索引 (实时模式时使用最后一个点)
export const effectiveIndex = derived(
    [isPlaybackMode, playbackIndex, sliderMax],
    ([$isPlaybackMode, $playbackIndex, $sliderMax]) => {
        return $isPlaybackMode ? Math.min($playbackIndex, $sliderMax) : $sliderMax;
    }
);

// 进入回放模式
export function enterPlaybackMode(): void {
    isPlaybackMode.set(true);
    isPlaying.set(false);
}

// 退出回放模式，返回实时模式
export function exitPlaybackMode(): void {
    isPlaybackMode.set(false);
    isPlaying.set(false);
    // 重置到最新点
    const max = get(sliderMax);
    playbackIndex.set(max);
}

// 设置播放索引
export function setPlaybackIndex(index: number): void {
    playbackIndex.set(index);
}

// 更新到最新点 (用于实时模式下新数据到达时)
export function updateToLatest(newMax: number): void {
    const $isPlaybackMode = get(isPlaybackMode);
    if (!$isPlaybackMode) {
        playbackIndex.set(Math.max(0, newMax));
    }
}

// 切换播放/暂停状态
export function togglePlayPause(): void {
    isPlaying.update(v => !v);
}

// 前进一步
export function stepForward(): void {
    const max = get(sliderMax);
    playbackIndex.update(idx => Math.min(idx + 1, max));
}

// 后退一步
export function stepBackward(): void {
    playbackIndex.update(idx => Math.max(idx - 1, 0));
}
