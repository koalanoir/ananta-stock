"use client";

import { createContext, useContext } from "react";
import type { AccountSessionContext } from "@/lib/account-session";

const AccountSessionContextValue =
  createContext<AccountSessionContext | null>(null);

export function AccountSessionProvider({
  value,
  children,
}: {
  value: AccountSessionContext | null;
  children: React.ReactNode;
}) {
  return (
    <AccountSessionContextValue.Provider value={value}>
      {children}
    </AccountSessionContextValue.Provider>
  );
}

export function useAccountSession() {
  return useContext(AccountSessionContextValue);
}
