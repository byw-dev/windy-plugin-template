<script lang="ts">
    import { currentTrackData } from '../stores/pollingStore';

    // Helper to format numbers safely
    const fmt = (val: number | undefined, decimals: number = 2, suffix: string = ''): string => {
        if (val === undefined || val === null) return '-';
        return val.toFixed(decimals) + suffix;
    };

    // Helper to format small numbers in scientific notation if needed, or fixed
    const fmtSci = (val: number | undefined, decimals: number = 2, suffix: string = ''): string => {
        if (val === undefined || val === null) return '-';
        if (val !== 0 && (Math.abs(val) < 0.01 || Math.abs(val) > 10000)) {
            return val.toExponential(decimals) + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };

    // Helper for timestamp
    const fmtTime = (ts: number | undefined): string => {
        if (!ts) return '-';
        // Check if ts is seconds or ms. Usually seconds for API timestamps
        const date = new Date(ts * 1000);
        return date.toISOString().split('.')[0]
    };

    let data;
    $: data = $currentTrackData;
</script>

<div class="track-info-grid">
    <!-- Header Row -->
    <div class="cell">PlaneID: {data?.id || '-'}</div>
    <div class="cell">Alt: {fmt(data?.alt, 0, ' m')}</div>

    <!-- Basic Info -->
    <div class="cell">Time: {fmtTime(data?.timestamp)}</div>
    <div class="cell">WS: {fmt(data?.ws, 1, ' m/s')}</div>

    <div class="cell">Lat: {fmt(data?.lat, 4)}</div>
    <div class="cell">Lon: {fmt(data?.lon, 4)}</div>

    <div class="cell header">Speed: {fmt(data?.speed, 1, ' m/s')}</div>
    <div class="cell header">Heading: {fmt(data?.heading, 0, '°')}</div>

    <div class="cell">Temp: {fmt(data?.tmp, 1, '°C')}</div>
    <div class="cell">Hum: {fmt(data?.hum, 1, '%')}</div>

    <!-- Cloud Physics -->
    <div class="cell">icfp_num: {fmt(data?.icfp_num_conc, 2, ' #/cm^3')}</div>
    <div class="cell">scdp_num: {fmt(data?.scdp_num_conc, 2, ' #/cm^3')}</div>

    <div class="cell">icfp_lwc: {fmtSci(data?.icfp_lwc, 2, ' g/m^3')}</div>
    <div class="cell">scdp_lwc: {fmtSci(data?.scdp_lwc, 2, ' g/m^3')}</div>

    <div class="cell">icfp_mvd: {fmt(data?.icfp_mvd, 2, ' um')}</div>
    <div class="cell">scdp_mvd: {fmt(data?.scdp_mvd, 2, ' um')}</div>

    <div class="cell">icfp_ed: {fmt(data?.icfp_ed, 2, ' um')}</div>
    <div class="cell">scdp_ed: {fmt(data?.scdp_ed, 2, ' um')}</div>
</div>

<style lang="less">
    .track-info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1px;
        background: rgba(60, 60, 60, 0.4);
        padding: 5px;
        border-radius: 4px;
        font-size: 11px;
        margin-bottom: 20px;
        border: 1px solid rgba(255,255,255,0.1);
    }

    .cell {
        padding: 2px 5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: rgba(255, 255, 255, 0.85);
        background: rgba(0, 0, 0, 0.2);

        &.header {
            font-weight: bold;
            color: #fff;
            background: rgba(255, 255, 255, 0.1);
        }
    }
</style>

