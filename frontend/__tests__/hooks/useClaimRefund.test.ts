import { renderHook, act } from "@testing-library/react";
import { useClaimRefund } from "@/hooks/useClaimRefund";
import { useWallet } from "@/hooks/useWallet";
import * as stellar from "@/lib/stellar";
import * as api from "@/lib/api";

jest.mock("@/hooks/useWallet");
jest.mock("@/lib/stellar");
jest.mock("@/lib/api");

const mockUseWallet = useWallet as jest.Mock;
const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
const mockSubmitTransaction = stellar.submitTransaction as jest.Mock;
const mockDecodeScVal = stellar.decodeScVal as jest.Mock;
const mockFetchMarketById = api.fetchMarketById as jest.Mock;
const mockFetchMarketBets = api.fetchMarketBets as jest.Mock;

const ADDRESS = "GBETTOR";

const cancelledMarket = {
  id: "market-1",
  contractAddress: "market-1",
  fighterA: { name: "Fighter A", record: "10-0", nationality: "USA", weightClass: "Heavyweight" },
  fighterB: { name: "Fighter B", record: "9-1", nationality: "Canada", weightClass: "Heavyweight" },
  scheduledAt: "2024-01-01T00:00:00Z",
  bettingEndsAt: "2024-01-01T00:00:00Z",
  status: "Cancelled" as const,
  outcome: null,
  poolA: "5000000000",
  poolB: "5000000000",
  totalPool: "10000000000",
  oracleAddress: "GORACLE",
  createdBy: "GCREATOR",
};

const bet = {
  id: "bet-1",
  marketId: "market-1",
  bettor: ADDRESS,
  side: "FighterA" as const,
  amount: "1000000",
  placedAt: "2024-01-01T00:00:00Z",
  claimed: false,
  payout: null,
};

function wallet(overrides: Partial<{ address: string | null; isNetworkMismatched: boolean }> = {}) {
  return {
    address: ADDRESS,
    isConnected: true,
    isNetworkMismatched: false,
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    ...overrides,
  };
}

describe("useClaimRefund", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue(wallet());
    mockBuildSorobanInvocation.mockResolvedValue("xdr");
    mockSubmitTransaction.mockResolvedValue({ returnValue: "rv" });
    mockDecodeScVal.mockResolvedValue(BigInt(500));
    mockFetchMarketById.mockResolvedValue(cancelledMarket);
    mockFetchMarketBets.mockResolvedValue([bet]);
  });

  it("rejects when the wallet is not connected", async () => {
    mockUseWallet.mockReturnValue(wallet({ address: null }));
    const { result } = renderHook(() => useClaimRefund());

    await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
      "Wallet not connected"
    );
    expect(mockBuildSorobanInvocation).not.toHaveBeenCalled();
  });

  it("rejects when the wallet is on the wrong network", async () => {
    mockUseWallet.mockReturnValue(wallet({ isNetworkMismatched: true }));
    const { result } = renderHook(() => useClaimRefund());

    await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
      "Wallet is connected to the wrong network"
    );
  });

  it("rejects when the bet is not on this market", async () => {
    mockFetchMarketBets.mockResolvedValue([]);
    const { result } = renderHook(() => useClaimRefund());

    await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow("Bet not found");
    expect(mockBuildSorobanInvocation).not.toHaveBeenCalled();
  });

  it("rejects a market that is neither cancelled nor no-contest", async () => {
    mockFetchMarketById.mockResolvedValue({ ...cancelledMarket, status: "Open" });
    const { result } = renderHook(() => useClaimRefund());

    await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
      "Market is not in a refundable state"
    );
    expect(mockSubmitTransaction).not.toHaveBeenCalled();
  });

  it("accepts a resolved market whose outcome is NoContest", async () => {
    mockFetchMarketById.mockResolvedValue({
      ...cancelledMarket,
      status: "Resolved",
      outcome: "NoContest",
    });
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await result.current.claimRefund("bet-1", "market-1");
    });
    expect(mockSubmitTransaction).toHaveBeenCalledWith("signed-xdr");
  });

  it("builds, signs and submits claim_refund and returns the receipt", async () => {
    const { result } = renderHook(() => useClaimRefund());

    let receipt: Awaited<ReturnType<typeof result.current.claimRefund>> | undefined;
    await act(async () => {
      receipt = await result.current.claimRefund("bet-1", "market-1");
    });

    expect(mockBuildSorobanInvocation).toHaveBeenCalledWith({
      contractId: "market-1",
      method: "claim_refund",
      args: ["bet-1"],
      signerAddress: ADDRESS,
    });
    expect(mockSubmitTransaction).toHaveBeenCalledWith("signed-xdr");
    expect(receipt).toMatchObject({
      betId: "bet-1",
      bettor: ADDRESS,
      payout: BigInt(500),
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a failed submission in error state and rethrows it", async () => {
    mockSubmitTransaction.mockRejectedValue(new Error("tx_failed"));
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow("tx_failed");
    });

    expect(result.current.error?.message).toBe("tx_failed");
    expect(result.current.isLoading).toBe(false);
  });

  it("wraps a non-Error rejection in a generic Error", async () => {
    mockFetchMarketById.mockRejectedValue("nope");
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
        "Unknown error"
      );
    });
    expect(result.current.error?.message).toBe("Unknown error");
  });
});
