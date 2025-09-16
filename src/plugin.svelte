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
    <label for="planeID" class="mb-5">planeID:
        <input id="planeID" type="text" placeholder="PlaneID here..." class="input mb-20"
               bind:value={props.planeID}
               on:input={() => { try { localStorage.setItem(LS_PLANE_ID_KEY, props.planeID || ''); } catch (e) {} }} />
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
        const dt = new Date(t.timestamp * 1e3).toISOString();
        return `PlaneID: ${t.id}\n\n        Time: ${dt}\n\n        ${('duration' in t) ? `Duration: ${(t as any).duration}s\n` : ''}
        Lat: ${t.lat}°\n\n        Lon: ${t.lon}°\n\n        Alt: ${t.alt}m\n\n        Speed: ${t.speed}m/s\n\n        Heading: ${t.heading}°\n\n        `;
    };

    // localStorage 键
    const LS_BASE_URL_KEY = 'windy-plugin.baseURL';
    const LS_PLANE_ID_KEY = 'windy-plugin.planeID';

    const props: Properties = { baseURL: '', planeID: '' };

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
            const pid = localStorage.getItem(LS_PLANE_ID_KEY);
            if (bu !== null) props.baseURL = bu;
            if (pid !== null) props.planeID = pid;
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
        if (!props.baseURL || !props.planeID) return;
        // 首次成功后才进入轮询并切换按钮
        fetchPlaneTrack(props.planeID).then(() => {
            isPolling = true;
            pollTimer = window.setInterval(async () => {
                try { await fetchPlaneTrack(props.planeID); }
                catch (e) { stopPolling(true); }
            }, pollingIntervalMs);
        }).catch(() => { stopPolling(true); });
    }

    function stopPolling(dueToError: boolean) {
        if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
        isPolling = false;
        if (dueToError) { lastPollOk = false; centerOnPlane = false; }
    }

    async function fetchPlaneTrack(planeID: string): Promise<void> {
        const apiURL = `${props.baseURL}/planes/${planeID}/track`;
        const resp = await fetch(apiURL);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data: PlaneResult = await resp.json();

        const previousTracks = PLANE_TRACK_STORE.get(planeID) || [];
        const tracks = (data.tracks || []) as PlaneTrack[];
        if (tracks.length > 0) {
            previousTracks.push(...tracks);
            PLANE_TRACK_STORE.set(planeID, previousTracks);
        }

        latestTrack = trackToString(data);

        // 更新折线
        const duration = (data as any).alt || 0;
        const color = `hsl(${(duration / 10 + 60) % 360}, 100%, 45%)`;
        const trackPoints = previousTracks.map(t => L.latLng(t.lat, t.lon, t.alt));

        // 清理其它飞机图层
        PLANE_LAYER_STORE.forEach((value, key) => {
            if (key !== planeID) { map.removeLayer(value); PLANE_LAYER_STORE.delete(key); }
        });

        let polyline = PLANE_LAYER_STORE.get(planeID);
        if (!polyline) {
            polyline = new L.Polyline(trackPoints, { color, weight: 2 });
            polyline.addTo(map);
            PLANE_LAYER_STORE.set(planeID, polyline);
        } else {
            polyline.setLatLngs(trackPoints);
        }

        // 最新位置与飞机标记
        if (previousTracks.length > 0) {
            const last = previousTracks[previousTracks.length - 1];
            latestPosition = [last.lat, last.lon];

            // 若切换了 planeID，移除旧标记
            if (currentMarkerPlaneId && currentMarkerPlaneId !== planeID && planeMarker) {
                map.removeLayer(planeMarker);
                planeMarker = null;
            }
            if (!planeMarker) {
                planeMarker = L.marker(L.latLng(last.lat, last.lon), { icon: createPlaneIcon() });
                planeMarker.addTo(map);
                currentMarkerPlaneId = planeID;
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
</style>
