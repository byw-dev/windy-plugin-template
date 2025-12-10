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
}

export interface PlaneResult extends PlaneTrack {
    duration: number;
    tracks: PlaneTrack[];
}

export interface DisplayedPlane extends PlaneResult {
    color: string;
}

export interface ExtendedPlaneMarker {
    id: string;
    marker: L.Marker;
    latestPosition: [number, number];
}

export interface Properties {
    [key: string]: string;
}
