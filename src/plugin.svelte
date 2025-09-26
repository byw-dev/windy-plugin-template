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

    <label for="baseURL" class="mb-5">Base URL:
        <input id="baseURL" type="text" placeholder="API baseURL..." class="input mb-20"
               bind:value={props.baseURL}
               on:input={() => { try { localStorage.setItem(LS_BASE_URL_KEY, props.baseURL || ''); } catch (e) {} }} />
    </label>
    <label for="flightID_planeID" class="mb-5">FlightID_PlaneID:
        <input id="flightID_planeID" type="text" placeholder="FlightID_PlaneID here..." class="input mb-20"
               bind:value={props.flightID_planeID}
               on:input={() => { try { localStorage.setItem(LS_FLIGHT_ID_PLANE_ID_KEY, props.flightID_planeID || ''); } catch (e) {} }} />
    </label>

    <div class="btn-row">
        <button class="button button--variant-blue size-m"
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
        return `PlaneID: ${t.id}\n\n        Time: ${dt}\n\n        ${('duration' in t) ? `Duration: ${(t as any).duration}s\n` : ''}
        Lat: ${t.lat}°\n\n        Lon: ${t.lon}°\n\n        Alt: ${t.alt}m\n\n        Speed: ${t.speed}m/s\n\n        Heading: ${t.heading}°\n\n        `;
    };

    // localStorage 键
    const LS_BASE_URL_KEY = 'windy-plugin.baseURL';
    const LS_FLIGHT_ID_PLANE_ID_KEY = 'windy-plugin.flightID_planeID';

    const props: Properties = { baseURL: '', flightID_planeID: '' };

    const PLANE_TRACK_STORE: Map<string, PlaneTrack[]> = new Map();
    const PLANE_LAYER_STORE: Map<string, L.Polyline> = new Map();

    let latestTrack: string = '无事发生';

    // 轮询与跟踪状态
    let isPolling = false;
    let pollTimer: number | null = null;
    let centerOnPlane = false;
    let hasData = false;
    let lastPollOk = false;
    let latestPosition: [number, number] | null = null;
    const pollingIntervalMs = 3000;

    // 飞机标记
    let planeMarker: L.Marker | null = null;
    let currentMarkerPlaneId: string | null = null;

    $: showTrackButton = hasData && lastPollOk;

    export const onopen = (_params: unknown) => {
        console.log('Plugin opened with params:', _params);
    };

    onMount(() => {
        // 读取本地存储
        try {
            const bu = localStorage.getItem(LS_BASE_URL_KEY);
            const pid = localStorage.getItem(LS_FLIGHT_ID_PLANE_ID_KEY);
            if (bu !== null) props.baseURL = bu;
            if (pid !== null) props.flightID_planeID = pid;
        } catch (e) {}
        console.log('Plugin mounted');
    });

    onDestroy(() => {
        stopPolling(false);
        if (planeMarker) { map.removeLayer(planeMarker); planeMarker = null; currentMarkerPlaneId = null; }
        console.log('Plugin destroyed');
    });

    function startPolling() {
        if (isPolling) return;
        if (!props.baseURL || !props.flightID_planeID) return;
        // 首次成功后才进入轮询并切换按钮
        fetchPlaneTrack(props.flightID_planeID).then(() => {
            isPolling = true;
            pollTimer = window.setInterval(async () => {
                try { await fetchPlaneTrack(props.flightID_planeID); }
                catch (e) { stopPolling(true); }
            }, pollingIntervalMs);
        }).catch(() => { stopPolling(true); });
    }

    function stopPolling(dueToError: boolean) {
        if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
        isPolling = false;
        if (dueToError) { lastPollOk = false; centerOnPlane = false; }
    }

    async function fetchPlaneTrack(flightID_planeID: string): Promise<void> {
        const apiURL = `${props.baseURL}/track/${flightID_planeID}/all`;
        const previousTracks = PLANE_TRACK_STORE.get(flightID_planeID) || [];
        const lastTrack = previousTracks.length > 0 ? previousTracks[previousTracks.length - 1] : null;
        console.log('Fetching from', apiURL, 'with last track', lastTrack);
        const lastDtParam = lastTrack ? `?last_dt=${new Date(lastTrack.timestamp * 1e3).toISOString().split('.')[0]}` : '';
        const resp = await fetch(apiURL + lastDtParam);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data: PlaneResult = await resp.json();

        const tracks = (data.tracks || []) as PlaneTrack[];
        if (tracks.length > 0) {
            previousTracks.push(...tracks);
            PLANE_TRACK_STORE.set(flightID_planeID, previousTracks);
        }

        latestTrack = trackToString(data);

        // 更新折线
        const trackPoints = previousTracks.map(t => {
            // 按高度修改颜色，取值范围 [0, 6000]
            const altitudeRatio = Math.min(t.alt / 6000, 1); // 限制最大值为 1
            const hue = (1 - altitudeRatio) * 120; // 高度越高，越红（0），高度越低，越绿（120）
            const color = `hsl(${hue}, 100%, 50%)`; // 固定明度为 50%

            return {
                latLng: L.latLng(t.lat, t.lon, t.alt),
                color
            };
        });

        // 清理其它飞机图层
        PLANE_LAYER_STORE.forEach((value, key) => {
            if (key !== flightID_planeID) { map.removeLayer(value); PLANE_LAYER_STORE.delete(key); }
        });

        // 使用多个 Polyline 实现分段着色
        trackPoints.reduce((prev, curr) => {
            if (prev) {

                const segment = L.polyline([prev.latLng, curr.latLng], {
                    color: prev.color,
                    weight: 2
                });
                segment.addTo(map);
                PLANE_LAYER_STORE.set(flightID_planeID, segment);
            }
            return curr;
        }, null);

        // 最新位置与飞机标记
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
            } else {
                planeMarker.setLatLng([last.lat, last.lon]);
            }
            // 设置朝向
            const el = planeMarker.getElement();
            if (el) {
                const rot = el.querySelector('.plane-rot') as HTMLElement | null;
                if (rot) {
                    rot.style.transformOrigin = '50% 50%';
                    rot.style.transform = `rotate(${last.heading}deg)`;
                }
            }
        }

        hasData = previousTracks.length > 0;
        lastPollOk = true;

        if (centerOnPlane && latestPosition) {
            map.setView(L.latLng(latestPosition[0], latestPosition[1]), map.getZoom());
        }
    }
</script>

<style lang="less">
  // Put any LESS of CSS styles here
  .btn-row { display: flex; gap: 10px; align-items: center; }
  .plane-icon { pointer-events: none; }
  .plane-icon .plane-rot { transform-origin: 50% 50%; }
  .tooltip { pointer-events: none; }
</style>
