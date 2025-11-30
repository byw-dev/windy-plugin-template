<div class="plugin__mobile-header">
    { title }
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={() => bcast.emit('rqstOpen', 'menu')}
    >
        { title }
    </div>

    <div class="form-group size-m m-2 left">
        <label for="baseURL" class="m-2">Base URL:
            <input id="baseURL" type="text" placeholder="API baseURL..." class="input mb-20"
                   bind:value={props.baseURL}
                   on:input={() => { try { localStorage.setItem(LS_BASE_URL_KEY, props.baseURL || ''); } catch (e) {} }} />
        </label>
        <label for="uavAssertID" class="m-2">UAV Assert ID:
            <input id="uavAssertID" type="text" placeholder="UAV Assert ID here..." class="input mb-20"
                   bind:value={props.uavAssertID}
                   on:input={() => { try { localStorage.setItem(LS_UAV_ASSERT_ID_KEY, props.uavAssertID || ''); } catch (e) {} }} />
        </label>
        <button class="button button--variant-blue size-m centered"
                on:click={() => { if (!isGeoJsonLoaded) loadAsserts(props.uavAssertID); else unloadAsserts(); }}>
            { isGeoJsonLoaded ? 'Unload' : 'Load' }
        </button>
        <label for="flightID_planeID" class="m-2">FlightID_PlaneID:
            <input id="flightID_planeID" type="text" placeholder="FlightID_PlaneID here..." class="input mb-20"
                   bind:value={props.flightID_planeID}
                   on:input={() => { try { localStorage.setItem(LS_FLIGHT_ID_PLANE_ID_KEY, props.flightID_planeID || ''); } catch (e) {} }} />
        </label>
    </div>


    <div class="btn-row">
        <button class="button button--variant-blue size-m"
                disabled={isFetching}
                on:click={() => { if (!isPolling) startPolling(); else stopPolling(false); }}>
            { isPolling ? 'Deactivate' : 'Activate' }
        </button>
        {#if showTrackButton}
            <button class="button size-m"
                    on:click={() => {
                        centerOnPlane = !centerOnPlane;
                        if (centerOnPlane && latestPosition) {
                            map.setView(L.latLng(latestPosition[0], latestPosition[1]), map.getZoom());
                        }
                    }}>
                Track
            </button>
        {/if}
    </div>

    {#if hasData && currentTracks.length > 0}
        <div class="playback-controls">
            <input
                type="range"
                class="playback-slider"
                min="0"
                max={sliderMax}
                bind:value={playbackIndex}
                on:input={handleSliderInput}
                on:change={handleSliderChange}
            />
            <div class="playback-time">
                {#if currentTracks.length > 0 && effectiveIndex >= 0 && effectiveIndex < currentTracks.length}
                    {new Date(currentTracks[effectiveIndex].timestamp * 1000).toISOString().split('.')[0].replace('T', ' ')}
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
                    title={isPlaying ? '暂停' : '播放'}
                >
                    {#if isPlaying}
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

    <pre class="text mb-40">{latestTrack}</pre>
</section>
<script lang="ts">
    /* exported onopen */
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';
    import { createPlaneIcon } from './planeIcon';

    import config from './pluginConfig';

    const { title } = config;

    import type { Properties, PlaneResult, PlaneTrack } from './pluginTypes';

    const trackToString = (t: PlaneTrack): string => {
        if (!t) return 'No track data available.';
        const dt = new Date(t.timestamp * 1e3).toISOString().split('.')[0];
        return `        PlaneID: ${t.id}\n\n        Time: ${dt}\n\n        ${('duration' in t) ? `Duration: ${(t as any).duration}s\n` : ''}
        Lat: ${t.lat}°\n\n        Lon: ${t.lon}°\n\n        Alt: ${t.alt}m\n\n        Speed: ${t.speed}m/s\n\n        Heading: ${t.heading}°\n\n        `;
    };

    // localStorage 键
    const LS_BASE_URL_KEY = 'windy-plugin.baseURL';
    const LS_FLIGHT_ID_PLANE_ID_KEY = 'windy-plugin.flightID_planeID';
    const LS_UAV_ASSERT_ID_KEY = 'windy-plugin.uavAssertID';

    const props: Properties = { baseURL: '', flightID_planeID: '' };

    const PLANE_TRACK_STORE: Map<string, PlaneTrack[]> = new Map();
    const PLANE_LAYER_STORE: Map<string, L.Polyline> = new Map();

    // 用于触发 Svelte 响应式更新的计数器（因为 Map 变化不会自动触发响应式）
    let trackStoreVersion = 0;

    let latestTrack: string = '无事发生';

    // 轮询与跟踪状态
    let isPolling = false;
    let isFetching = false; // 新增：用于防止重复点击
    let pollTimer: number | null = null;
    let noNewDataSince: number | null = null; // 新增：用于超时检查
    const POLLING_TIMEOUT_MS = 30000; // 30秒超时

    let centerOnPlane = false;
    let hasData = false;
    let lastPollOk = false;
    let latestPosition: [number, number] | null = null;
    const pollingIntervalMs = 3000;

    // 飞机标记
    let planeMarker: L.Marker | null = null;
    let currentMarkerPlaneId: string | null = null;

    // GeoJson 状态
    let isGeoJsonLoaded = false;

    // 回放状态 (plan01.md 2.1)
    let isPlaybackMode = false;      // 模式开关：false=实时模式, true=回放模式
    let playbackIndex = 0;           // 当前轨迹点索引，用于滑块绑定
    let isPlaying = false;           // 播放状态：true=自动播放中, false=暂停
    let playbackTimer: number | null = null;      // 自动播放计时器
    let fastForwardTimer: number | null = null;   // 长按快进/快退计时器

    // 获取当前飞机的轨迹数据（依赖 trackStoreVersion 触发响应式更新）
    $: currentTracks = trackStoreVersion >= 0 && props.flightID_planeID ? (PLANE_TRACK_STORE.get(props.flightID_planeID) || []) : [];
    // 计算滑块的最大值（至少为0，避免-1）
    $: sliderMax = Math.max(0, currentTracks.length - 1);
    // 计算有效的播放索引（实时模式时使用最后一个点）
    $: effectiveIndex = isPlaybackMode ? Math.min(playbackIndex, sliderMax) : sliderMax;

    $: showTrackButton = hasData && lastPollOk;

    export const onopen = (_params: unknown) => {
        console.log('Plugin opened with params:', _params);
    };

    // ========== 回放控制函数 (plan01.md 2.3, 2.4) ==========

    /**
     * 统一的地图显示更新函数
     * @param isDragging - 是否正在拖动滑块（true时只移动飞机，不重绘轨迹线）
     */
    function updateMapDisplay(isDragging = false) {
        const tracks = currentTracks;
        if (tracks.length === 0) return;

        // 获取当前有效索引
        const idx = effectiveIndex;
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
        latestTrack = trackToString(currentTrack);

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
                    PLANE_LAYER_STORE.set(`${props.flightID_planeID}_${i}`, segment);
                }
                return curr;
            }, null as { latLng: L.LatLng; color: string; } | null);
        }

        // 更新最新位置（用于 Track 按钮）
        latestPosition = [currentTrack.lat, currentTrack.lon];
    }

    // 进度条拖动时 (on:input) - 只移动飞机图标
    function handleSliderInput(event: Event) {
        const target = event.target as HTMLInputElement;
        const idx = parseInt(target.value, 10);
        if (isNaN(idx)) return;

        isPlaybackMode = true;
        isPlaying = false;
        stopPlaybackTimer();
        playbackIndex = idx;

        updateMapDisplay(true); // 只移动飞机
    }

    // 进度条拖动结束 (on:change) - 重绘轨迹线
    function handleSliderChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const idx = parseInt(target.value, 10);
        if (isNaN(idx)) return;

        playbackIndex = idx;
        updateMapDisplay(false); // 重绘轨迹
    }

    // 播放/暂停按钮
    function togglePlayPause() {
        isPlaybackMode = true;
        isPlaying = !isPlaying;

        if (isPlaying) {
            startPlaybackTimer();
        } else {
            stopPlaybackTimer();
        }
    }

    // 启动自动播放计时器
    function startPlaybackTimer() {
        if (playbackTimer !== null) return;

        playbackTimer = window.setInterval(() => {
            if (playbackIndex < sliderMax) {
                playbackIndex++;
                updateMapDisplay(false);
            } else {
                // 到达末尾，切换回实时模式
                exitPlaybackMode();
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

    // 退出回放模式，返回实时模式
    function exitPlaybackMode() {
        stopPlaybackTimer();
        stopFastForwardTimer();
        isPlaybackMode = false;
        isPlaying = false;
        playbackIndex = sliderMax; // 回到最后一个点
        updateMapDisplay(false);
    }

    // 后退按钮单击
    function handleBackClick() {
        isPlaybackMode = true;
        isPlaying = false;
        stopPlaybackTimer();

        if (playbackIndex > 0) {
            playbackIndex--;
            updateMapDisplay(false);
        }
    }

    // 后退按钮长按开始
    function handleBackMouseDown() {
        fastForwardTimer = window.setInterval(() => {
            if (playbackIndex > 0) {
                playbackIndex--;
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
        isPlaybackMode = true;
        isPlaying = false;
        stopPlaybackTimer();

        if (playbackIndex < sliderMax) {
            playbackIndex++;
            updateMapDisplay(false);
        }
    }

    // 前进按钮长按开始
    function handleForwardMouseDown() {
        fastForwardTimer = window.setInterval(() => {
            if (playbackIndex < sliderMax) {
                playbackIndex++;
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

    onMount(() => {
        // 读取本地存储
        try {
            const bu = localStorage.getItem(LS_BASE_URL_KEY);
            const pid = localStorage.getItem(LS_FLIGHT_ID_PLANE_ID_KEY);
            const uid = localStorage.getItem(LS_UAV_ASSERT_ID_KEY);
            if (bu !== null) props.baseURL = bu;
            if (pid !== null) props.flightID_planeID = pid;
            if (uid !== null) props.uavAssertID = uid;
        } catch (e) {
        }
        console.log('Plugin mounted');
    });

    onDestroy(() => {
        stopPolling(false);
        stopPlaybackTimer();
        stopFastForwardTimer();
        if (planeMarker) {
            map.removeLayer(planeMarker);
            planeMarker = null;
            currentMarkerPlaneId = null;
        }
        console.log('Plugin destroyed');
    });

    function startPolling() {
        if (isPolling || isFetching) return;
        if (!props.baseURL || !props.flightID_planeID) {
            bcast.emit('notification', {
                type: 'error',
                title: 'Plugin Error',
                text: 'Please provide Base URL and FlightID_PlaneID.',
                duration: 5000,
            });
            return;
        }

        isPolling = true;
        noNewDataSince = Date.now(); // 开始计时

        const poll = async () => {
            // 检查超时
            if (noNewDataSince && Date.now() - noNewDataSince > POLLING_TIMEOUT_MS) {
                bcast.emit('notification', {
                    type: 'info',
                    title: 'Polling Stopped',
                    text: 'No new data for 30 seconds.',
                    duration: 5000,
                });
                stopPolling(false);
                return;
            }

            await fetchPlaneTrack(props.flightID_planeID);
        };

        // 立即执行一次，然后设置定时器
        poll();
        pollTimer = window.setInterval(poll, pollingIntervalMs);
    }

    function stopPolling(dueToError: boolean) {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        isPolling = false;
        isFetching = false; // 确保 fetching 状态也被重置
        noNewDataSince = null; // 重置计时器

        if (dueToError) {
            lastPollOk = false;
            centerOnPlane = false;
        }
    }

    const calc_circle_radius = () => {
        const currentZoom = map.getZoom();
        return Math.max(2, 8 * (currentZoom / 10));
    };

    async function loadAsserts(uavAssertID: string) {
        const apiURL = `${props.baseURL}/geojson/${uavAssertID}`;
        if (isGeoJsonLoaded) {
            unloadAsserts();
            return;
        }

        const resp = await fetch(apiURL);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data = await resp.json();

        // 处理 GeoJSON 数据
        L.geoJSON(data, {
            pointToLayer: (feature, latlng) => {
                const radius = calc_circle_radius();
                const color = feature.properties.color || 'rgba(0, 255, 0, 0.5)';
                return L.circleMarker(latlng, {
                    radius: radius, // 小圆圈的半径
                    fillColor: color, // 绿色半透明
                    color: color, // 边框颜色与填充颜色一致
                    weight: 2, // 边框宽度
                    opacity: 1, // 边框不透明度
                    fillOpacity: 0.5, // 填充透明度
                });
            },
            onEachFeature: (feature, layer) => {
                // 为每个特征添加 tooltip
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
        isGeoJsonLoaded = true;

        // 确保 Point 类型在最上层
        map.eachLayer((layer) => {
            if (layer instanceof L.CircleMarker) {
                layer.bringToFront();
            }
        });

        // 动态调整 CircleMarker 的大小
        map.on('zoomend', () => {
            map.eachLayer((layer) => {
                if (layer instanceof L.CircleMarker) {
                    const newRadius = calc_circle_radius(); // 根据缩放级别调整半径
                    layer.setRadius(newRadius);
                }
            });
        });
        // 按GeoJson 里的第一个 Point 点居中显示地图
        if (data.features && data.features.length > 0) {
            const firstPoint = data.features.find((f: any) => f.geometry.type === 'Point');
            if (firstPoint) {
                const [lon, lat] = firstPoint.geometry.coordinates;
                const currentZoom = map.getZoom();
                if (currentZoom < 8) {
                    map.setView(L.latLng(lat, lon), 8);
                } else {
                    map.setView(L.latLng(lat, lon), currentZoom);
                }
            }
        }
    }

    function unloadAsserts() {
        // 卸载 GeoJSON 数据
        map.eachLayer((layer) => {
            // 只移除我们添加的图层，避免移除其他重要图层
            if (layer instanceof L.GeoJSON) {
                map.removeLayer(layer);
            }
        });
        isGeoJsonLoaded = false;
    }

    async function fetchPlaneTrack(flightID_planeID: string): Promise<void> {
        if (isFetching) return; // 如果正在请求，则跳过本次轮询

        isFetching = true;

        try {
            // 如果 flightID_planeID 中包含特殊字符反斜杠 '\'，需要进行编码
            let trackFilename = flightID_planeID;
            if (flightID_planeID.includes('\\')) {
                trackFilename = encodeURIComponent(flightID_planeID);
            }
            const apiURL = `${props.baseURL}/track/${trackFilename}/all`;
            const previousTracks = PLANE_TRACK_STORE.get(flightID_planeID) || [];
            const lastTrack = previousTracks.length > 0 ? previousTracks[previousTracks.length - 1] : null;
            console.log('Fetching from', apiURL, 'with last track', lastTrack);
            const lastDtParam = lastTrack ? `?last_dt=${new Date(lastTrack.timestamp * 1e3).toISOString().split('.')[0]}` : '';
            const resp = await fetch(apiURL + lastDtParam);

            if (!resp.ok) {
                const errorText = await resp.text();
                bcast.emit('notification', {
                    type: 'error',
                    title: 'Fetch Error',
                    text: `HTTP ${resp.status}: ${errorText || resp.statusText}`,
                    duration: 5000,
                });
                lastPollOk = false;
                return;
            }

            const data: PlaneResult = await resp.json();
            const tracks = (data.tracks || []) as PlaneTrack[];

            if (tracks.length > 0) {
                noNewDataSince = Date.now(); // 收到新数据，重置计时器
                previousTracks.push(...tracks);
                PLANE_TRACK_STORE.set(flightID_planeID, previousTracks);
                trackStoreVersion++; // 触发 Svelte 响应式更新
                hasData = true;
            }

            latestTrack = trackToString(data);
            lastPollOk = true;

            // 如果不在回放模式，使用 updateMapDisplay 更新视图
            if (!isPlaybackMode) {
                // 更新 playbackIndex 到最新点
                playbackIndex = Math.max(0, previousTracks.length - 1);
                
                // 先确保飞机标记存在
                if (previousTracks.length > 0) {
                    const last = previousTracks[previousTracks.length - 1];
                    latestPosition = [last.lat, last.lon];

                    // 若切换了 flightID_planeID，移除旧标记
                    if (currentMarkerPlaneId && currentMarkerPlaneId !== flightID_planeID && planeMarker) {
                        map.removeLayer(planeMarker);
                        planeMarker = null;
                    }
                    if (!planeMarker) {
                        planeMarker = L.marker(L.latLng(last.lat, last.lon), { icon: createPlaneIcon() });
                        planeMarker.addTo(map);
                        currentMarkerPlaneId = flightID_planeID;
                    }
                }

                // 使用统一的渲染函数更新显示
                updateMapDisplay(false);

                if (centerOnPlane && latestPosition) {
                    map.setView(L.latLng(latestPosition[0], latestPosition[1]), map.getZoom());
                }
            } else {
                // 在回放模式下，只更新数据，不改变显示
                // 但要确保飞机标记存在
                if (previousTracks.length > 0 && !planeMarker) {
                    const last = previousTracks[previousTracks.length - 1];
                    planeMarker = L.marker(L.latLng(last.lat, last.lon), { icon: createPlaneIcon() });
                    planeMarker.addTo(map);
                    currentMarkerPlaneId = flightID_planeID;
                }
            }
        } catch (e: any) {
            bcast.emit('notification', {
                type: 'error',
                title: 'Fetch Failed',
                text: e.message,
                duration: 5000,
            });
            lastPollOk = false;
        } finally {
            isFetching = false;
        }
    }
</script>

<style lang="less">
  // Put any LESS of CSS styles here
  .btn-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .plane-icon {
    pointer-events: none;
  }

  .plane-icon .plane-rot {
    transform-origin: 50% 50%;
  }

  .tooltip {
    pointer-events: none;
  }

  /* 回放控件样式 (plan01.md) */
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
