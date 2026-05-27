declare module 'react-date-range' {
    export interface Range {
        startDate?: any;
        endDate?: any;
        key?: string;
    }
    export const DateRangePicker: any;
}

interface Window {
    __TAURI__?: {
        window: {
            WebviewWindow: any;
        };
    };
}
