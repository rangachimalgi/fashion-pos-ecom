"use client";

import { DeleteRequestsPanel } from "@/components/pos/DeleteRequestsPanel";

export default function DeleteRequestsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-6 md:px-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Bill delete requests</h2>
        <p className="text-sm text-muted-foreground">
          Managers and staff cannot delete POS bills. They send a request with a reason, and the
          bill stays until you approve it.
        </p>
      </div>
      <DeleteRequestsPanel role="admin" theme="admin" />
    </div>
  );
}
