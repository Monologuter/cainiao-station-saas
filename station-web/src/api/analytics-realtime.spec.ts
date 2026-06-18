import { describe, expect, it, vi } from "vitest";
import { analyticsSocketUrl, connectAnalyticsRealtime } from "./analytics-realtime";
import { io } from "socket.io-client";

const socketState = vi.hoisted(() => {
  const handlers: Record<string, (payload?: unknown) => void> = {};
  const socket = {
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = handler;
      return socket;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return { handlers, socket };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => socketState.socket),
}));

vi.mock("./http", () => ({
  getStoredToken: () => "access-token",
}));

describe("analytics realtime client", () => {
  it("builds socket namespace url from api base", () => {
    expect(analyticsSocketUrl("/api")).toBe("/analytics");
    expect(analyticsSocketUrl("http://localhost:3100/api")).toBe(
      "http://localhost:3100/analytics",
    );
  });

  it("connects with auth, subscribes to station, and forwards events", () => {
    const onSnapshot = vi.fn();
    const onMetric = vi.fn();
    const connection = connectAnalyticsRealtime({
      stationId: "s1",
      onSnapshot,
      onMetric,
    });

    expect(io).toHaveBeenCalledWith("/analytics", {
      auth: { token: "access-token" },
      transports: ["websocket"],
    });
    socketState.handlers.connect();
    expect(socketState.socket.emit).toHaveBeenCalledWith("subscribe:station", {
      stationId: "s1",
    });

    socketState.handlers["snapshot:init"]({ overview: { pickupRate: 90 } });
    socketState.handlers["metric:update"]({ metric: "inbound", delta: 1 });
    expect(onSnapshot).toHaveBeenCalledWith({ overview: { pickupRate: 90 } });
    expect(onMetric).toHaveBeenCalledWith({ metric: "inbound", delta: 1 });

    connection.disconnect();
    expect(socketState.socket.disconnect).toHaveBeenCalled();
  });
});
