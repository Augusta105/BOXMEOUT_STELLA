import { renderHook, act, waitFor } from "@testing-library/react";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useWallet } from "@/hooks/useWallet";
import * as stellar from "@/lib/stellar";

jest.mock("@/hooks/useWallet");
jest.mock("@/lib/stellar");

const mockUseWallet = useWallet as jest.Mock;
const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
const mockSubmitTransaction = stellar.submitTransaction as jest.Mock;

describe("usePlaceBet", () => {
  const mockAddress = "GADDR1234567890ABCDEF";

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      address: mockAddress,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    });
  });

  it("throws error when wallet not connected", async () => {
    mockUseWallet.mockReturnValueOnce({
      address: null,
      isConnected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: jest.fn(),
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    await expect(
      act(async () => {
        await result.current.placeBet("FighterA", 100n);
      })
    ).rejects.toThrow("Wallet not connected");
  });

  it("throws error when wallet network is mismatched", async () => {
    mockUseWallet.mockReturnValueOnce({
      address: mockAddress,
      isConnected: true,
      isNetworkMismatched: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: jest.fn(),
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    await expect(
      act(async () => {
        await result.current.placeBet("FighterA", 100n);
      })
    ).rejects.toThrow("Wallet is connected to the wrong network");

    expect(mockBuildSorobanInvocation).not.toHaveBeenCalled();
  });

  it("builds Soroban invocation with correct params", async () => {
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: null,
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    await act(async () => {
      await result.current.placeBet("FighterA", 100n);
    });

    expect(mockBuildSorobanInvocation).toHaveBeenCalledWith({
      contractId: "market-1",
      method: "place_bet",
      args: ["FighterA", 100n],
      signerAddress: mockAddress,
    });
  });

  it("signs transaction with wallet", async () => {
    const mockSignTransaction = jest.fn().mockResolvedValueOnce("signed-xdr");
    mockUseWallet.mockReturnValueOnce({
      address: mockAddress,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: mockSignTransaction,
    });

    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: null,
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    await act(async () => {
      await result.current.placeBet("FighterA", 100n);
    });

    expect(mockSignTransaction).toHaveBeenCalledWith("xdr-string");
  });

  it("submits signed transaction to network", async () => {
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: null,
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    await act(async () => {
      await result.current.placeBet("FighterA", 100n);
    });

    expect(mockSubmitTransaction).toHaveBeenCalledWith("signed-xdr");
  });

  it("returns confirmed Bet object on success", async () => {
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: null,
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    let bet: any;
    await act(async () => {
      bet = await result.current.placeBet("FighterA", 100n);
    });

    expect(bet).toMatchObject({
      id: "tx-hash-123",
      marketId: "market-1",
      bettor: mockAddress,
      side: "FighterA",
      amount: "100",
      claimed: false,
      payout: null,
    });
    expect(bet.placedAt).toBeDefined();
  });

  it("sets isLoading false after transaction completes", async () => {
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: null,
    });

    const { result } = renderHook(() => usePlaceBet("market-1"));

    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.placeBet("FighterA", 100n);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("initializes with null error", () => {
    const { result } = renderHook(() => usePlaceBet("market-1"));

    expect(result.current.error).toBeNull();
  });

  it("sets error state and rethrows when submission fails", async () => {
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockRejectedValueOnce(new Error("400 bad request"));

    const { result } = renderHook(() => usePlaceBet("market-1"));

    await act(async () => {
      await expect(result.current.placeBet("FighterA", 100n)).rejects.toThrow("400 bad request");
    });

    expect(result.current.error?.message).toBe("400 bad request");
    expect(result.current.isLoading).toBe(false);
  });

  it("reports isLoading while the bet is in flight", async () => {
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => usePlaceBet("market-1"));

    act(() => {
      result.current.placeBet("FighterA", 100n).catch(() => {});
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
  });
});
