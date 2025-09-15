export interface PlaneTrack {
    id: string;
    timestamp: number;
    lon: number;
    lat: number;
    alt: number;
    speed: number;
    heading: number;
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
