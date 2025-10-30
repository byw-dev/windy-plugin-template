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

    // GeoJson 状态
    let isGeoJsonLoaded = false;

    $: showTrackButton = hasData && lastPollOk;

    export const onopen = (_params: unknown) => {
        console.log('Plugin opened with params:', _params);
    };

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
        if (planeMarker) {
            map.removeLayer(planeMarker);
            planeMarker = null;
            currentMarkerPlaneId = null;
        }
        console.log('Plugin destroyed');
    });

    function startPolling() {
        if (isPolling) return;
        if (!props.baseURL || !props.flightID_planeID) return;
        // 首次成功后才进入轮询并切换按钮
        fetchPlaneTrack(props.flightID_planeID).then(() => {
            isPolling = true;
            pollTimer = window.setInterval(async () => {
                try {
                    await fetchPlaneTrack(props.flightID_planeID);
                } catch (e) {
                    stopPolling(true);
                }
            }, pollingIntervalMs);
        }).catch(() => {
            stopPolling(true);
        });
    }

    function stopPolling(dueToError: boolean) {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        isPolling = false;
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
                // 自定义 Point 类型的样式
                if (feature.geometry.type === 'Point') {
                    const color = feature.properties.color || 'rgba(0, 255, 0, 0.5)';
                    return L.circleMarker(latlng, {
                        // radius: 10, // 小圆圈的半径
                        radius: radius, // 小圆圈的半径
                        // fillColor: 'rgba(0, 255, 0, 0.5)', // 绿色半透明
                        // color: 'rgba(0, 255, 0, 0.5)', // 边框颜色与填充颜色一致
                        fillColor: color, // 绿色半透明
                        color: color, // 边框颜色与填充颜色一致
                        weight: 2, // 边框宽度
                        opacity: 1, // 边框不透明度
                        fillOpacity: 0.5, // 填充透明度
                    });
                }
                return null; // 非 Point 类型不处理
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
                color,
            };
        });

        // 清理其它飞机图层
        PLANE_LAYER_STORE.forEach((value, key) => {
            if (key !== flightID_planeID) {
                map.removeLayer(value);
                PLANE_LAYER_STORE.delete(key);
            }
        });

        // 使用多个 Polyline 实现分段着色
        trackPoints.reduce((prev, curr) => {
            if (prev) {

                const segment = L.polyline([prev.latLng, curr.latLng], {
                    color: prev.color,
                    weight: 2,
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
