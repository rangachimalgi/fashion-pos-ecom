"use client";

import { Suspense, useState } from "react";
import { StoreHeader, useHeaderDepartment } from "@/components/store/StoreHeader";
import type { StoreDepartment } from "@/lib/categories";

type AppHeaderProps = {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  selectedDepartment?: StoreDepartment;
};

function AppHeaderInner({
  searchQuery: controlledSearchQuery,
  onSearchChange: controlledOnSearchChange,
  selectedDepartment: controlledDepartment,
}: AppHeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const selectedDepartment = useHeaderDepartment(controlledDepartment);

  return (
    <StoreHeader
      searchQuery={controlledSearchQuery ?? searchQuery}
      onSearchChange={controlledOnSearchChange ?? setSearchQuery}
      selectedDepartment={selectedDepartment}
    />
  );
}

export function AppHeader(props: AppHeaderProps = {}) {
  return (
    <Suspense
      fallback={
        <StoreHeader
          searchQuery={props.searchQuery ?? ""}
          onSearchChange={props.onSearchChange ?? (() => {})}
          selectedDepartment={props.selectedDepartment ?? "Men"}
        />
      }
    >
      <AppHeaderInner {...props} />
    </Suspense>
  );
}
