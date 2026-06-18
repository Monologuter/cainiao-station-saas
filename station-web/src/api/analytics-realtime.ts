import { io, type Socket } from "socket.io-client";
import { getStoredToken } from "./http";
import type { AnalyticsOverview, AnalyticsRanking } from "./analytics";

export interface AnalyticsSnapshot {
  overview?: AnalyticsOverview;
  ranking?: AnalyticsRanking;
}

export interface AnalyticsMetricFrame {
  tenantId: string;
  stationId: string;
  metric: string;
  value?: number | null;
  delta?: number;
  date: string;
}

export interface AnalyticsRealtimeHandlers {
  stationId?: string;
  onSnapshot?: (payload: AnalyticsSnapshot) => void;
  onMetric?: (payload: AnalyticsMetricFrame) => void;
  onParcelStored?: (payload: unknown) => void;
}

export interface AnalyticsRealtimeConnection {
  socket: Socket;
  disconnect: () => void;
}

export function analyticsSocketUrl(apiBase = import.meta.env.VITE_API_BASE ?? "/api") {
  if (!apiBase || apiBase === "/api") {
    return "/analytics";
  }
  if (/^https?:\/\//i.test(apiBase)) {
    const url = new URL(apiBase);
    url.pathname = url.pathname.replace(/\/api\/?$/, "") || "/";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/analytics`;
    return url.toString().replace(/\/$/, "");
  }
  return `${apiBase.replace(/\/api\/?$/, "").replace(/\/$/, "")}/analytics`;
}

export function connectAnalyticsRealtime(
  handlers: AnalyticsRealtimeHandlers = {},
): AnalyticsRealtimeConnection {
  const socket = io(analyticsSocketUrl(), {
    auth: { token: getStoredToken() ?? "" },
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    if (handlers.stationId) {
      socket.emit("subscribe:station", { stationId: handlers.stationId });
    }
  });
  socket.on("snapshot:init", (payload) => handlers.onSnapshot?.(payload));
  socket.on("metric:update", (payload) => handlers.onMetric?.(payload));
  socket.on("parcel:stored", (payload) => handlers.onParcelStored?.(payload));

  return {
    socket,
    disconnect: () => socket.disconnect(),
  };
}
