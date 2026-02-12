export interface PlaneTrack {
    id: string;
    timestamp: number;
    lon: number;
    lat: number;
    alt: number;
    speed: number;    // 对地速度 (m/s)
    heading: number;  // 对地航向 (度)
    ws?: number;      // 风速 (m/s)
    wd?: number;      // 风向 (度)
    tmp?: number;
    hum?: number;

    // Cloud physics parameters
    icfp_num_conc?: number;
    icfp_lwc?: number;
    icfp_mvd?: number;
    icfp_ed?: number;
    scdp_num_conc?: number;
    scdp_lwc?: number;
    scdp_mvd?: number;
    scdp_ed?: number;
}
// ...existing code...
export interface PlaneResult extends PlaneTrack {
    duration: number;
    tracks: PlaneTrack[];
}

