import { useEffect, useState, useCallback } from "react";
import type { BillingSubscription, LimitExceededError } from "../types";
import { getBillingStatus, createCheckoutSession, openBillingPortal } from "../lib/api";
import { useAuth } from "./useAuth";

export function useBilling() {
  const { user } = useAuth();
  const [billing, setBilling] = useState<BillingSubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeModalError, setUpgradeModalError] = useState<LimitExceededError | null>(null);

  const fetchBilling = useCallback(async () => {
    if (!user) {
      setBilling(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const sessionIdParam = urlParams.get("session_id") || undefined;
      const data = await getBillingStatus(sessionIdParam);
      setBilling(data);
      setError(null);
    } catch (err: unknown) {
      console.error("Failed to fetch billing status:", err);
      setError(err instanceof Error ? err.message : "Failed to load billing status");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const handleCheckout = async (tier: "analyst" | "studio") => {
    try {
      const { checkout_url } = await createCheckoutSession(tier);
      if (checkout_url) {
        window.location.href = checkout_url;
      }
    } catch (err: unknown) {
      console.error("Checkout failed:", err);
      throw err;
    }
  };

  const handleOpenPortal = async () => {
    try {
      const { portal_url } = await openBillingPortal();
      if (portal_url) {
        window.location.href = portal_url;
      }
    } catch (err: unknown) {
      console.error("Portal open failed:", err);
      throw err;
    }
  };

  const triggerUpgradeModal = (limitErr: LimitExceededError) => {
    setUpgradeModalError(limitErr);
  };

  const closeUpgradeModal = () => {
    setUpgradeModalError(null);
  };

  return {
    billing,
    loading,
    error,
    upgradeModalError,
    refreshBilling: fetchBilling,
    handleCheckout,
    handleOpenPortal,
    triggerUpgradeModal,
    closeUpgradeModal,
  };
}
