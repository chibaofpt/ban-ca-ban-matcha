declare module "@goongmaps/goong-js" {
  export interface LngLat {
    lat: number;
    lng: number;
  }

  export interface GoongErrorEvent {
    error?: { message?: string };
    preventDefault?: () => void;
  }

  export interface FlyToOptions {
    center: [number, number];
    zoom: number;
    speed: number;
    essential: boolean;
  }

  export class Map {
    constructor(options: {
      container: HTMLElement;
      style: string;
      center: [number, number];
      zoom: number;
      attributionControl: boolean;
    });
    on(event: "error", listener: (event: GoongErrorEvent) => void): this;
    on(event: "load" | "moveend", listener: () => void): this;
    resize(): void;
    addSource(id: string, source: object): void;
    addLayer(layer: object): void;
    addControl(control: object, position: string): void;
    getCenter(): LngLat;
    flyTo(options: FlyToOptions): void;
    remove(): void;
  }

  export class Marker {
    constructor(options: { element: HTMLElement });
    setLngLat(coordinates: [number, number]): this;
    addTo(map: Map): this;
  }

  export class NavigationControl {
    constructor(options: { showCompass: boolean });
  }

  const goongjs: {
    accessToken: string;
    Map: typeof Map;
    Marker: typeof Marker;
    NavigationControl: typeof NavigationControl;
  };
  export default goongjs;
}
