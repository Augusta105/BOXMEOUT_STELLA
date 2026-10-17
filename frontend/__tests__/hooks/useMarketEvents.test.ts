import { renderHook, act } from "@testing-library/react";
import { useMarketEvents } from "@/hooks/useMarketEvents";
import * as api from "@/lib/api";

jest.mock("@/lib/api");

const mockFetchMarketStats = api.fetchMarketStats as jest.Mock;

const stats = {
  totalBets: 2,
  uniqueBettors: 2,
  poolA: "3000",
  poolB: "7000",
  totalVolume: "10000",
  impliedOddsA: 30,
  impliedOddsB: 70,
};

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

const latestSource = () => MockEventSource.instances[MockEventSource.instances.length - 1];

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

describe("useMarketEvents", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockEventSource.instances = [];
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: MockEventSource,
    });
    mockFetchMarketStats.mockReset();
    mockFetchMarketStats.mockResolvedValue(stats);
    setHidden(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    // @ts-expect-error removing the test double so other suites see no EventSource
    delete globalThis.EventSource;
  });

  it("subscribes to the market's events stream", () => {
    renderHook(() => useMarketEvents("market-1"));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestSource().url).toMatch(/\/markets\/market-1\/events$/);
  });

  it("applies pool totals from each stream message", () => {
    const { result } = renderHook(() => useMarketEvents("market-1"));

    act(() => {
      latestSource().onmessage?.({ data: JSON.stringify(stats) } as MessageEvent<string>);
    });

    expect(result.current.poolA).toBe(BigInt(3000));
    expect(result.current.poolB).toBe(BigInt(7000));
    expect(result.current.impliedOddsA).toBe(30);
    expect(result.current.isLoading).toBe(false);
  });

  it("ignores malformed frames", () => {
    const { result } = renderHook(() => useMarketEvents("market-1"));

    act(() => {
      latestSource().onmessage?.({ data: "{not json" } as MessageEvent<string>);
    });

    expect(result.current.poolA).toBeNull();
  });

  it("falls back to polling when the stream errors, then reconnects", async () => {
    renderHook(() => useMarketEvents("market-1"));
    const first = latestSource();

    await act(async () => {
      first.onerror?.();
    });
    expect(first.close).toHaveBeenCalled();
    expect(mockFetchMarketStats).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("backs off between reconnect attempts", async () => {
    renderHook(() => useMarketEvents("market-1"));

    await act(async () => {
      latestSource().onerror?.();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    await act(async () => {
      latestSource().onerror?.();
    });
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("stops polling once the stream opens", async () => {
    renderHook(() => useMarketEvents("market-1"));

    await act(async () => {
      latestSource().onerror?.();
    });
    await act(async () => {
      latestSource().onopen?.();
    });

    const callsAfterOpen = mockFetchMarketStats.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(12000);
    });
    expect(mockFetchMarketStats.mock.calls.length).toBe(callsAfterOpen);
  });

  it("polls instead of streaming when EventSource is unavailable", async () => {
    // @ts-expect-error simulate an environment without EventSource
    delete globalThis.EventSource;
    const { result } = renderHook(() => useMarketEvents("market-1"));
    await flush();

    expect(mockFetchMarketStats).toHaveBeenCalledTimes(1);
    expect(result.current.poolB).toBe(BigInt(7000));

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(mockFetchMarketStats).toHaveBeenCalledTimes(2);
  });

  it("surfaces a polling failure as an error", async () => {
    // @ts-expect-error simulate an environment without EventSource
    delete globalThis.EventSource;
    mockFetchMarketStats.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useMarketEvents("market-1"));
    await flush();

    expect(result.current.error?.message).toBe("boom");
    expect(result.current.isLoading).toBe(false);
  });

  it("closes the stream while hidden and reconnects when visible", () => {
    renderHook(() => useMarketEvents("market-1"));
    const first = latestSource();

    setHidden(true);
    expect(first.close).toHaveBeenCalled();

    setHidden(false);
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("closes the stream on unmount", () => {
    const { unmount } = renderHook(() => useMarketEvents("market-1"));
    const first = latestSource();

    unmount();
    expect(first.close).toHaveBeenCalled();
  });
});
