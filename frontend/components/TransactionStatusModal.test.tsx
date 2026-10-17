import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionStatusModal, humanizeError } from "./TransactionStatusModal";

const FALLBACK = "The transaction failed. Please check your wallet and try again.";

describe("TransactionStatusModal", () => {
  it("renders nothing when closed", () => {
    render(<TransactionStatusModal isOpen={false} status="pending" onClose={jest.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a pending dialog with no way to dismiss it", () => {
    render(<TransactionStatusModal isOpen status="pending" onClose={jest.fn()} />);

    expect(screen.getByRole("dialog", { name: "Processing Transaction…" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not close on Escape while pending", () => {
    const onClose = jest.fn();
    render(<TransactionStatusModal isOpen status="pending" onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the confirmed state with an explorer link for the hash", () => {
    render(
      <TransactionStatusModal
        isOpen
        status="success"
        txHash="abc123"
        onClose={jest.fn()}
        explorerBaseUrl="https://explorer.example/tx/"
      />
    );

    expect(screen.getByRole("dialog", { name: "Transaction Confirmed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on Stellar Expert/ })).toHaveAttribute(
      "href",
      "https://explorer.example/tx/abc123"
    );
  });

  it("omits the explorer link when there is no hash", () => {
    render(<TransactionStatusModal isOpen status="success" onClose={jest.fn()} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("closes from the Done button on success", () => {
    const onClose = jest.fn();
    render(<TransactionStatusModal isOpen status="success" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly error and closes from Dismiss", () => {
    const onClose = jest.fn();
    render(
      <TransactionStatusModal isOpen status="error" errorMessage="User declined the signature" onClose={onClose} />
    );

    expect(screen.getByText("User declined the signature")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("replaces a stack-trace style error with the generic message", () => {
    render(
      <TransactionStatusModal isOpen status="error" errorMessage={"Error: boom\n    at foo.js:1"} onClose={jest.fn()} />
    );

    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
    expect(screen.queryByText(/at foo\.js/)).not.toBeInTheDocument();
  });

  it("closes on a backdrop click when dismissable, and not when the panel is clicked", () => {
    const onClose = jest.fn();
    render(<TransactionStatusModal isOpen status="success" onClose={onClose} />);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape when dismissable", () => {
    const onClose = jest.fn();
    render(<TransactionStatusModal isOpen status="error" errorMessage="x" onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("humanizeError", () => {
  it("gives a generic message when there is no error", () => {
    expect(humanizeError(null)).toBe("An unexpected error occurred. Please try again.");
    expect(humanizeError(undefined)).toBe("An unexpected error occurred. Please try again.");
  });

  it("keeps only the first line of a multi-line message", () => {
    expect(humanizeError("Insufficient balance\nsee logs for details")).toBe("Insufficient balance");
  });

  it("reads the message of an Error", () => {
    expect(humanizeError(new Error("Wallet locked"))).toBe("Wallet locked");
  });

  it("falls back for raw objects and very long strings", () => {
    expect(humanizeError('{"code":-1}')).toBe(FALLBACK);
    expect(humanizeError("x".repeat(201))).toBe(FALLBACK);
  });
});
