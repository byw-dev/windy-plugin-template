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
                   bind:value={baseURL}
                   on:input={handleBaseURLChange} />
        </label>
        <label for="uavAssertID" class="m-2">UAV Assert ID:
            <input id="uavAssertID" type="text" placeholder="UAV Assert ID here..." class="input mb-20"
                   bind:value={uavAssertID}
                   on:input={handleUavAssertIDChange} />
        </label>
        <button class="button button--variant-blue size-m centered"
                on:click={handleLoadUnloadAsserts}>
            { $isGeoJsonLoaded ? 'Unload' : 'Load' }
        </button>
        <label for="flightID_planeID" class="m-2">FlightID_PlaneID:
            <input id="flightID_planeID" type="text" placeholder="FlightID_PlaneID here..." class="input mb-20"
                   bind:value={flightID_planeID}
                   on:input={handleFlightIDChange} />
        </label>
    </div>


    <div class="btn-row">
        <button class="button button--variant-blue size-m"
                disabled={$isFetching}
                on:click={handleActivateDeactivate}>
            { $isPolling ? 'Deactivate' : 'Activate' }
        </button>
        {#if $hasTrackData && $lastFetchOk}
            <button class="button size-m"
                    on:click={handleTrackToggle}>
                Track
            </button>
        {/if}
        {#if $hasTrackData}
            <button class="button size-m"
                    on:click={handleSimToggle}>
                { showSimulationControls ? 'Sim-OFF' : 'Sim-ON' }
            </button>
        {/if}
    </div>

    <TrackInfoTable />

    <PlaybackControls />

    <!-- 模拟控制 -->
    {#if $hasTrackData && showSimulationControls}
        <div class="simulation-controls">
            <h3 class="simulation-title">Weather Modification Simulation</h3>
            <div class="simulation-inputs">
                <label for="simulationRadius" class="m-1">
                    Radius (m):
                    <input
                        id="simulationRadius"
                        type="number"
                        class="input-small"
                        bind:value={simulationRadius}
                        min="100"
                        max="5000"
                        step="50"
                    />
                </label>
                <label for="timeThreshold" class="m-1">
                    Time Threshold (s):
                    <input
                        id="timeThreshold"
                        type="number"
                        class="input-small"
                        bind:value={timeThreshold}
                        min="1"
                        max="60"
                        step="1"
                    />
                </label>

                <!-- 风速风向来源切换 -->
                <div class="wind-source-toggle">
                    <label class="toggle-label">
                        <input
                            type="checkbox"
                            bind:checked={$useCustomWind}
                        />
                        <span>Use Custom Wind</span>
                    </label>
                </div>

                <!-- 自定义风速风向输入 -->
                {#if $useCustomWind}
                    <label for="customWindSpeed" class="m-1">
                        Wind Speed (m/s):
                        <input
                            id="customWindSpeed"
                            type="number"
                            class="input-small"
                            bind:value={$customWindSpeed}
                            min="0"
                            max="50"
                            step="0.5"
                        />
                    </label>
                    <label for="customWindDirection" class="m-1">
                        Wind Direction (°):
                        <input
                            id="customWindDirection"
                            type="number"
                            class="input-small"
                            bind:value={$customWindDirection}
                            min="0"
                            max="360"
                            step="5"
                        />
                    </label>
                {/if}
            </div>
            <button
                class="button button--variant-blue size-m centered mt-10"
                on:click={handleSimulation}
            >
                Simulate
            </button>
        </div>
    {/if}


</section>
<script lang="ts">
    /* exported onopen */
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';
    import PlaybackControls from './components/PlaybackControls.svelte';
    import TrackInfoTable from './components/TrackInfoTable.svelte';

    // 导入 stores
    import {
        currentPlaneId,
        hasTrackData,
        getTracks,
    } from './stores/trackStore';
    import {
        isPolling,
        isFetching,
        lastFetchOk,
        centerOnPlane,
        latestPosition,
        setPolling,
        resetPollingState,
    } from './stores/pollingStore';
    import {
        simulationLayers,
        isSimulated,
        useCustomWind,
        customWindSpeed,
        customWindDirection,
    } from './stores/simulationStore';
    import {
        isPlaybackMode,
        playbackIndex,
    } from './stores/playbackStore';

    // 导入 services
    import {
        fetchPlaneTrack,
        removePlaneMarker,
        clearTrackLayers,
        clearSimulationLayersFromMap,
        updateMapDisplay,
    } from './services/trackService';
    import {
        isGeoJsonLoaded,
        loadAsserts,
        unloadAsserts,
    } from './services/geoJsonService';
    import { runSimulation } from './services/simulationService';

    const { title } = config;

    // localStorage 键
    const LS_BASE_URL_KEY = 'windy-plugin.baseURL';
    const LS_FLIGHT_ID_PLANE_ID_KEY = 'windy-plugin.flightID_planeID';
    const LS_UAV_ASSERT_ID_KEY = 'windy-plugin.uavAssertID';

    // 配置属性
    let baseURL = '';
    let flightID_planeID = '';
    let uavAssertID = '';

    // 模拟参数
    let simulationRadius = 500;
    let timeThreshold = 10;
    let showSimulationControls = false;

    // 轮询相关
    let pollTimer: number | null = null;
    let noNewDataSince: number | null = null;
    const POLLING_TIMEOUT_MS = 30000;
    const pollingIntervalMs = 3000;

    export const onopen = (_params: unknown) => {
        console.log('Plugin opened with params:', _params);
    };

    // ========== 事件处理函数 ==========

    function handleBaseURLChange() {
        try {
            localStorage.setItem(LS_BASE_URL_KEY, baseURL || '');
        } catch (e) {
        }
    }

    function handleUavAssertIDChange() {
        try {
            localStorage.setItem(LS_UAV_ASSERT_ID_KEY, uavAssertID || '');
        } catch (e) {
        }
    }

    function handleFlightIDChange() {
        try {
            localStorage.setItem(LS_FLIGHT_ID_PLANE_ID_KEY, flightID_planeID || '');
        } catch (e) {
        }
        // 更新 store 中的当前飞机ID
        currentPlaneId.set(flightID_planeID);
    }

    function handleLoadUnloadAsserts() {
        if (!$isGeoJsonLoaded) {
            loadAsserts(baseURL, uavAssertID);
        } else {
            unloadAsserts();
        }
    }

    function handleActivateDeactivate() {
        if (!$isPolling) {
            startPolling();
        } else {
            stopPolling(false);
        }
    }

    function handleTrackToggle() {
        centerOnPlane.update(v => !v);
        if ($centerOnPlane && $latestPosition) {
            map.setView(L.latLng($latestPosition[0], $latestPosition[1]), map.getZoom());
        }
    }

    function handleSimToggle() {
        showSimulationControls = !showSimulationControls;
        if (!showSimulationControls) {
            // 当 Sim-OFF 时
            // 1. 重置模拟状态
            isSimulated.set(false);
            // 2. 清空模拟数据
            simulationLayers.set([]);
            // 3. 立即清除地图上的图层
            clearSimulationLayersFromMap();
        }
    }

    function handleSimulation() {
        const planeId = $currentPlaneId;
        if (!planeId) {
            console.error('Simulation Error: No plane data available.');
            return;
        }

        const tracks = getTracks(planeId);
        if (tracks.length === 0) {
            console.error('Simulation Error: No track data available for simulation.');
            return;
        }

        // 运行模拟，传入风速风向参数
        const layers = runSimulation(
            tracks,
            simulationRadius,
            timeThreshold,
            $useCustomWind,
            $customWindSpeed,
            $customWindDirection,
        );

        // 更新 store
        simulationLayers.set(layers);
        isSimulated.set(true);

        // 触发地图更新，传入当前轨迹和索引以确保状态同步
        const currentIdx = $isPlaybackMode ? $playbackIndex : tracks.length - 1;
        updateMapDisplay(false, tracks, currentIdx);

        console.log(`Simulation Complete. Generated ${layers.length} simulation layers.`);
    }

    // ========== 轮询逻辑 ==========

    function startPolling() {
        if ($isPolling || $isFetching) return;
        if (!baseURL || !flightID_planeID) {
            console.error('Plugin Error: Please provide Base URL and FlightID_PlaneID.');
            return;
        }

        // 设置当前飞机ID
        currentPlaneId.set(flightID_planeID);

        setPolling(true);
        noNewDataSince = Date.now();

        const poll = async () => {
            // 检查超时
            if (noNewDataSince && Date.now() - noNewDataSince > POLLING_TIMEOUT_MS) {
                console.log('Polling Stopped: No new data for 30 seconds.');
                stopPolling(false);
                return;
            }

            const hasNewData = await fetchPlaneTrack(baseURL, flightID_planeID);
            if (hasNewData) {
                noNewDataSince = Date.now();

                // 如果启用了跟踪，则居中显示
                if ($centerOnPlane && $latestPosition) {
                    map.setView(L.latLng($latestPosition[0], $latestPosition[1]), map.getZoom());
                }
            }
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
        resetPollingState();
        noNewDataSince = null;

        if (dueToError) {
            lastFetchOk.set(false);
            centerOnPlane.set(false);
        }
    }

    // ========== 生命周期 ==========

    onMount(() => {
        // 读取本地存储
        try {
            const bu = localStorage.getItem(LS_BASE_URL_KEY);
            const pid = localStorage.getItem(LS_FLIGHT_ID_PLANE_ID_KEY);
            const uid = localStorage.getItem(LS_UAV_ASSERT_ID_KEY);
            if (bu !== null) baseURL = bu;
            if (pid !== null) flightID_planeID = pid;
            if (uid !== null) uavAssertID = uid;

            // 初始化 store
            if (pid) currentPlaneId.set(pid);
        } catch (e) {
        }
        console.log('Plugin mounted');
    });

    onDestroy(() => {
        stopPolling(false);
        removePlaneMarker();
        clearTrackLayers();
        console.log('Plugin destroyed');
    });
</script>

<style lang="less">
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

  .simulation-controls {
    margin-top: 15px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .simulation-title {
    font-size: 14px;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.9);
    margin: 0 0 10px 0;
    text-align: center;
  }

  .simulation-inputs {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;

    label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
    }
  }

  .input-small {
    width: 100px;
    padding: 4px 8px;
    font-size: 12px;
  }

  .wind-source-toggle {
    margin: 8px 0;
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;

    input[type="checkbox"] {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }

    span {
      user-select: none;
    }
  }

  .mt-10 {
    margin-top: 10px;
  }

  .centered {
    margin-left: auto;
    margin-right: auto;
  }
</style>
