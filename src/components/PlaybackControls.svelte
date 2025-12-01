<!--
  PlaybackControls - 回放控制组件
  负责显示进度条和播放控制按钮
-->
<script lang="ts">
    import { onDestroy } from 'svelte';
    import {
        sliderMax,
        currentTracks,
        hasTrackData,
    } from '../stores/trackStore';
    import {
        isPlaybackMode,
        playbackIndex,
        isPlaying,
        effectiveIndex,
        enterPlaybackMode,
        exitPlaybackMode,
        setPlaybackIndex,
        stepForward,
        stepBackward,
    } from '../stores/playbackStore';
    import { updateMapDisplay } from '../services/trackService';

    // 计时器
    let playbackTimer: number | null = null;
    let fastForwardTimer: number | null = null;

    // 格式化时间戳
    function formatTimestamp(timestamp: number): string {
        return new Date(timestamp * 1000).toISOString().split('.')[0].replace('T', ' ');
    }

    // 进度条拖动时 (on:input) - 只移动飞机图标
    function handleSliderInput(event: Event) {
        const target = event.target as HTMLInputElement;
        const idx = parseInt(target.value, 10);
        if (isNaN(idx)) return;

        enterPlaybackMode();
        stopPlaybackTimer();
        setPlaybackIndex(idx);
        updateMapDisplay(true); // 只移动飞机
    }

    // 进度条拖动结束 (on:change) - 重绘轨迹线
    function handleSliderChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const idx = parseInt(target.value, 10);
        if (isNaN(idx)) return;

        setPlaybackIndex(idx);
        updateMapDisplay(false); // 重绘轨迹
    }

    // 播放/暂停按钮
    function togglePlayPause() {
        enterPlaybackMode();
        isPlaying.update(v => !v);

        if ($isPlaying) {
            stopPlaybackTimer();
        } else {
            startPlaybackTimer();
        }
    }

    // 启动自动播放计时器
    function startPlaybackTimer() {
        if (playbackTimer !== null) return;

        playbackTimer = window.setInterval(() => {
            if ($playbackIndex < $sliderMax) {
                stepForward();
                updateMapDisplay(false);
            } else {
                // 到达末尾，切换回实时模式
                handleExitPlaybackMode();
            }
        }, 1000); // 每秒1个点
    }

    // 停止自动播放计时器
    function stopPlaybackTimer() {
        if (playbackTimer !== null) {
            clearInterval(playbackTimer);
            playbackTimer = null;
        }
    }

    // 退出回放模式
    function handleExitPlaybackMode() {
        stopPlaybackTimer();
        stopFastForwardTimer();
        exitPlaybackMode();
        updateMapDisplay(false);
    }

    // 后退按钮单击
    function handleBackClick() {
        enterPlaybackMode();
        stopPlaybackTimer();

        if ($playbackIndex > 0) {
            stepBackward();
            updateMapDisplay(false);
        }
    }

    // 后退按钮长按开始
    function handleBackMouseDown() {
        fastForwardTimer = window.setInterval(() => {
            if ($playbackIndex > 0) {
                stepBackward();
                updateMapDisplay(false);
            } else {
                stopFastForwardTimer();
            }
        }, 100); // 每秒10个点
    }

    // 后退按钮长按结束
    function handleBackMouseUp() {
        stopFastForwardTimer();
    }

    // 前进按钮单击
    function handleForwardClick() {
        enterPlaybackMode();
        stopPlaybackTimer();

        if ($playbackIndex < $sliderMax) {
            stepForward();
            updateMapDisplay(false);
        }
    }

    // 前进按钮长按开始
    function handleForwardMouseDown() {
        fastForwardTimer = window.setInterval(() => {
            if ($playbackIndex < $sliderMax) {
                stepForward();
                updateMapDisplay(false);
            } else {
                stopFastForwardTimer();
            }
        }, 100); // 每秒10个点
    }

    // 前进按钮长按结束
    function handleForwardMouseUp() {
        stopFastForwardTimer();
    }

    // 停止快进/快退计时器
    function stopFastForwardTimer() {
        if (fastForwardTimer !== null) {
            clearInterval(fastForwardTimer);
            fastForwardTimer = null;
        }
    }

    // 清理计时器
    onDestroy(() => {
        stopPlaybackTimer();
        stopFastForwardTimer();
    });
</script>

{#if $hasTrackData && $currentTracks.length > 0}
    <div class="playback-controls">
        <input
            type="range"
            class="playback-slider"
            min="0"
            max={$sliderMax}
            bind:value={$playbackIndex}
            on:input={handleSliderInput}
            on:change={handleSliderChange}
        />
        <div class="playback-time">
            {#if $currentTracks.length > 0 && $effectiveIndex >= 0 && $effectiveIndex < $currentTracks.length}
                {formatTimestamp($currentTracks[$effectiveIndex].timestamp)}
            {/if}
        </div>
        <div class="playback-buttons">
            <button
                class="playback-btn"
                on:click={handleBackClick}
                on:mousedown={handleBackMouseDown}
                on:mouseup={handleBackMouseUp}
                on:mouseleave={handleBackMouseUp}
                title="后退"
            >
                <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
                </svg>
            </button>
            <button
                class="playback-btn play-btn"
                on:click={togglePlayPause}
                title={$isPlaying ? '暂停' : '播放'}
            >
                {#if $isPlaying}
                    <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                {:else}
                    <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M8 5v14l11-7L8 5z"/>
                    </svg>
                {/if}
            </button>
            <button
                class="playback-btn"
                on:click={handleForwardClick}
                on:mousedown={handleForwardMouseDown}
                on:mouseup={handleForwardMouseUp}
                on:mouseleave={handleForwardMouseUp}
                title="前进"
            >
                <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <path fill="currentColor" d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z"/>
                </svg>
            </button>
        </div>
    </div>
{/if}

<style lang="less">
  /* 回放控件样式 */
  .playback-controls {
    margin-top: 15px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .playback-slider {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      background: #4a9eff;
      border-radius: 50%;
      cursor: pointer;
    }

    &::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: #4a9eff;
      border-radius: 50%;
      cursor: pointer;
      border: none;
    }
  }

  .playback-time {
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    margin: 8px 0;
    font-family: monospace;
  }

  .playback-buttons {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 8px;
  }

  .playback-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    transition: background 0.2s, transform 0.1s;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    &:active {
      transform: scale(0.95);
      background: rgba(255, 255, 255, 0.3);
    }

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .play-btn {
    width: 48px;
    height: 48px;
    background: #4a9eff;
    border-color: #4a9eff;

    &:hover {
      background: #3a8eef;
    }

    svg {
      width: 24px;
      height: 24px;
    }
  }
</style>
