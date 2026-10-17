import { renderHook, act } from "@testing-library/react";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useVisibilityInterval", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("runs once immediately and then on every delay", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    expect(callback).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(callback).toHaveBeenCalledTimes(4);
  });

  it("does nothing when the delay is null", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, null));

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("stops ticking while the tab is hidden", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    setHidden(true);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires immediately and resumes when the tab becomes visible", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    setHidden(true);
    setHidden(false);
    expect(callback).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("does not start a second interval when visible fires again", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    setHidden(false);
    setHidden(false);
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("waits for the tab to be visible when it starts hidden", () => {
    const callback = jest.fn();
    setHidden(true);
    renderHook(() => useVisibilityInterval(callback, 1000));

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(callback).not.toHaveBeenCalled();

    setHidden(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("clears the interval on unmount", () => {
    const callback = jest.fn();
    const { unmount } = renderHook(() => useVisibilityInterval(callback, 1000));

    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback without restarting the interval", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useVisibilityInterval(cb, 1000), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
