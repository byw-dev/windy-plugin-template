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
    </div>

    <PlaybackControls />

    <pre class="text mb-40">{$latestTrackInfo}</pre>
</section>
<script lang="ts">
    /* exported onopen */
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';
    import PlaybackControls from './components/PlaybackControls.svelte';
    
    // 导入 stores
    import {
        currentPlaneId,
        hasTrackData,
    } from './stores/trackStore';
    import {
        isPolling,
        isFetching,
        lastFetchOk,
        centerOnPlane,
        latestPosition,
        latestTrackInfo,
        setPolling,
        resetPollingState,
    } from './stores/pollingStore';
    
    // 导入 services
    import {
        fetchPlaneTrack,
        removePlaneMarker,
        clearTrackLayers,
    } from './services/trackService';
    import {
        isGeoJsonLoaded,
        loadAsserts,
        unloadAsserts,
    } from './services/geoJsonService';

    const { title } = config;

    // localStorage 键
    const LS_BASE_URL_KEY = 'windy-plugin.baseURL';
    const LS_FLIGHT_ID_PLANE_ID_KEY = 'windy-plugin.flightID_planeID';
    const LS_UAV_ASSERT_ID_KEY = 'windy-plugin.uavAssertID';

    // 配置属性
    let baseURL = '';
    let flightID_planeID = '';
    let uavAssertID = '';

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
        } catch (e) {}
    }

    function handleUavAssertIDChange() {
        try {
            localStorage.setItem(LS_UAV_ASSERT_ID_KEY, uavAssertID || '');
        } catch (e) {}
    }

    function handleFlightIDChange() {
        try {
            localStorage.setItem(LS_FLIGHT_ID_PLANE_ID_KEY, flightID_planeID || '');
        } catch (e) {}
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

    // ========== 轮询逻辑 ==========

    function startPolling() {
        if ($isPolling || $isFetching) return;
        if (!baseURL || !flightID_planeID) {
            bcast.emit('notification', {
                type: 'error',
                title: 'Plugin Error',
                text: 'Please provide Base URL and FlightID_PlaneID.',
                duration: 5000,
            });
            return;
        }

        // 设置当前飞机ID
        currentPlaneId.set(flightID_planeID);
        
        setPolling(true);
        noNewDataSince = Date.now();

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
        } catch (e) {}
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
</style>
