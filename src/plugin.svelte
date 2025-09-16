<div class="plugin__mobile-header">
    { title }
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={ () => bcast.emit('rqstOpen', 'menu') }
    >
        { title }
    </div>
    <label for="baseURL" class="mb-5">Base URL:
        <input id="baseURL" type="text" placeholder="API baseURL..." class="input mb-20"
               bind:value={props.baseURL} />
    </label>
    <label for="planeID" class="mb-5">planeID:
        <input id="planeID" type="text" placeholder="PlaneID here..." class="input mb-20"
               bind:value={props.planeID} />
    </label>
    <button class="button button--variant-blue size-m"
            on:click={() => {
                // let lines = latestTrack.split('\n');
                // lines.push(new Date().toISOString());
                // latestTrack = lines.join('\n');
                // console.log('>>> ' + props.baseURL + ` : ${latestTrack}`);
                fetchPlaneTrack(props.planeID);
            }}>
        Fire!
    </button>
    <pre class="text mb-40">
        {latestTrack}
    </pre>
</section>
<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';

    const { title } = config;

    import type { Properties, PlaneResult, PlaneTrack } from './pluginTypes';


    const trackToString = (t: PlaneTrack): string => {
        if (!t) {
            return 'No track data available.';
        }
        const dt = new Date(t.timestamp * 1e3).toISOString();
        return `PlaneID: ${t.id}\n
        Time: ${dt}\n
        ${('duration' in t) ? `Duration: ${t.duration}s\n` : ''}
        Lat: ${t.lat}°\n
        Lon: ${t.lon}°\n
        Alt: ${t.alt}m\n
        Speed: ${t.speed}m/s\n
        Heading: ${t.heading}°\n
        `;
    };

    const props: Properties = {
        baseURL: 'http://localhost:8000',
        planeID: '12345',
    };

    const PLANE_TRACK_STORE: Map<string, PlaneTrack[]> = new Map();
    const PLANE_LAYER_STORE: Map<string, L.Polyline> = new Map();

    let latestTrack: string = '无事发生';


    export const onopen = (_params: unknown) => {
        // Your plugin was opened with parameters parsed from URL
        // or with LatLon object if opened from contextmenu
        console.log('Plugin opened with params:', _params);
    };

    onMount(() => {
        // Your plugin was mounted
        console.log('Plugin mounted');
    });

    onDestroy(() => {
        // Your plugin was destroyed
        console.log('Plugin destroyed');
    });

    function fetchPlaneTrack(planeID: string) {
        const apiURL = `${props.baseURL}/planes/${planeID}/track`;
        try {
            fetch(apiURL)
                .then(resp => {
                    if (!resp.ok) {
                        throw new Error(`HTTP error! status: ${resp.status}`);
                    }
                    return resp.json();
                })
                .then((data: PlaneResult) => {
                    const previousTracks = PLANE_TRACK_STORE.get(planeID) || [];
                    const tracks = data.tracks;
                    previousTracks.push(...tracks);
                    PLANE_TRACK_STORE.set(planeID, previousTracks);
                    latestTrack = trackToString(data);
                    console.log(previousTracks);

                    const duration = data.alt || 0;
                    const color = `hsl(${(duration / 10 + 60) % 360}, 100%, 45%)`;
                    const trackPoints = previousTracks.map(t => L.latLng(t.lat, t.lon, t.alt));
                    PLANE_LAYER_STORE.forEach((value, key) => {
                        if (key !== planeID) {
                            map.removeLayer(value);
                            PLANE_LAYER_STORE.delete(key);
                        }
                    })
                    let polyline = PLANE_LAYER_STORE.get(planeID);
                    if (polyline) {
                        polyline.addLatLng(trackPoints)
                    } else {

                        polyline = new L.Polyline(trackPoints, {
                            color,
                            weight: 2,
                        });
                        polyline.addTo(map);
                    }


                    // polyline.on('mouseover', () => polyline.setStyle({ weight: 4 }));
                    // polyline.on('mouseout', () => polyline.setStyle({ weight: 2 }));
                });
        } catch (error) {
            console.error('Error fetching plane track data:', error);
        }
    }
</script>

<style lang="less">
  // Put any LESS of CSS styles here
</style>

