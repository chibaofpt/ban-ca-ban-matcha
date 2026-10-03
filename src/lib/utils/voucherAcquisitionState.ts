import type {
  AcquiredVoucher,
  MyVoucher,
  VoucherPackage,
} from "@/src/services/customerVoucherService";

export type VoucherAcquisitionRequest = Pick<VoucherPackage, "id" | "acquisition_mode">;
export type VoucherAcquisitionStatus = "IDLE" | "PENDING" | "SUCCESS" | "ERROR";

export interface VoucherAcquisitionGateway {
  claimFreeVoucher: (packageId: string) => Promise<AcquiredVoucher>;
  exchangeVoucher: (packageId: string) => Promise<AcquiredVoucher>;
  refreshWallet: () => Promise<MyVoucher[]>;
  refreshCatalog?: () => Promise<void>;
}

export interface VoucherAcquisitionReceipt {
  acquired: AcquiredVoucher;
  wallet: MyVoucher[] | null;
  refreshError: Error | null;
}

export interface VoucherAcquisitionSnapshot {
  receipt: VoucherAcquisitionReceipt | null;
  status: VoucherAcquisitionStatus;
  error: Error | null;
}

export type VoucherAcquisitionListener = (receipt: VoucherAcquisitionReceipt | null) => void;

export interface VoucherAcquisitionCoordinator {
  acquire: (request: VoucherAcquisitionRequest) => Promise<VoucherAcquisitionReceipt>;
  retryRefresh: () => Promise<VoucherAcquisitionReceipt | null>;
  getReceipt: () => VoucherAcquisitionReceipt | null;
  subscribe: (listener: VoucherAcquisitionListener) => () => void;
  getSnapshot: () => VoucherAcquisitionSnapshot;
  subscribeState: (listener: () => void) => () => void;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Không thể cập nhật ví voucher.");
}

/** Coordinates one acquisition with a retry-only wallet refresh after success. */
export function createVoucherAcquisitionCoordinator(
  gateway: VoucherAcquisitionGateway,
): VoucherAcquisitionCoordinator {
  let inFlight: Promise<VoucherAcquisitionReceipt> | null = null;
  let refreshInFlight: Promise<VoucherAcquisitionReceipt | null> | null = null;
  let receipt: VoucherAcquisitionReceipt | null = null;
  let status: VoucherAcquisitionStatus = "IDLE";
  let error: Error | null = null;
  let snapshot: VoucherAcquisitionSnapshot = { receipt: null, status, error };
  const listeners = new Set<VoucherAcquisitionListener>();
  const stateListeners = new Set<() => void>();

  const notifyState = () => {
    stateListeners.forEach((listener) => listener());
  };

  const publish = (next: VoucherAcquisitionReceipt | null) => {
    receipt = next;
    snapshot = { receipt, status, error };
    listeners.forEach((listener) => listener(next));
    notifyState();
  };

  const setStatus = (next: VoucherAcquisitionStatus, nextError: Error | null) => {
    status = next;
    error = nextError;
    snapshot = { receipt, status, error };
    notifyState();
  };

  const acquire = (request: VoucherAcquisitionRequest): Promise<VoucherAcquisitionReceipt> => {
    if (inFlight) return inFlight;
    setStatus("PENDING", null);
    publish(null);
    const operation = (async (): Promise<VoucherAcquisitionReceipt> => {
      try {
        const acquired = request.acquisition_mode === "FREE_CLAIM"
          ? await gateway.claimFreeVoucher(request.id)
          : request.acquisition_mode === "POINTS_EXCHANGE"
            ? await gateway.exchangeVoucher(request.id)
            : (() => { throw new Error(`Unsupported acquisition mode: ${request.acquisition_mode}`); })();

        const acquiredReceipt: VoucherAcquisitionReceipt = {
          acquired,
          wallet: null,
          refreshError: null,
        };
        setStatus("SUCCESS", null);
        publish(acquiredReceipt);

        if (gateway.refreshCatalog) {
          await gateway.refreshCatalog().catch(() => undefined);
        }

        try {
          const wallet = await gateway.refreshWallet();
          const refreshedReceipt = { ...acquiredReceipt, wallet };
          publish(refreshedReceipt);
          return refreshedReceipt;
        } catch (refreshError: unknown) {
          const failedReceipt = { ...acquiredReceipt, refreshError: toError(refreshError) };
          publish(failedReceipt);
          return failedReceipt;
        }
      } catch (acquisitionError: unknown) {
        const normalized = toError(acquisitionError);
        setStatus("ERROR", normalized);
        throw normalized;
      }
    })();
    inFlight = operation.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const retryRefresh = (): Promise<VoucherAcquisitionReceipt | null> => {
    if (!receipt) return Promise.resolve(null);
    if (refreshInFlight) return refreshInFlight;
    const previousReceipt = receipt;
    const operation = (async (): Promise<VoucherAcquisitionReceipt> => {
      try {
        const wallet = await gateway.refreshWallet();
        const refreshedReceipt = { ...previousReceipt, wallet, refreshError: null };
        publish(refreshedReceipt);
        return refreshedReceipt;
      } catch (error: unknown) {
        const failedReceipt = { ...previousReceipt, refreshError: toError(error) };
        publish(failedReceipt);
        throw failedReceipt.refreshError;
      }
    })();
    refreshInFlight = operation.finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  };

  return {
    acquire,
    retryRefresh,
    getReceipt: () => receipt,
    getSnapshot: () => snapshot,
    subscribeState: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
