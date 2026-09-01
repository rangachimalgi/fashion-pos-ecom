"use client";

import { useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import type { StoreDepartment } from "@/lib/categories";

type AppHeaderProps = {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  selectedDepartment?: StoreDepartment;
  onDepartmentChange?: (department: StoreDepartment) => void;
};

export function AppHeader({
  searchQuery: controlledSearchQuery,
  onSearchChange: controlledOnSearchChange,
  selectedDepartment: controlledDepartment,
  onDepartmentChange: controlledOnDepartmentChange,
}: AppHeaderProps = {}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<StoreDepartment>("Men");

  return (
    <StoreHeader
      searchQuery={controlledSearchQuery ?? searchQuery}
      onSearchChange={controlledOnSearchChange ?? setSearchQuery}
      selectedDepartment={controlledDepartment ?? selectedDepartment}
      onDepartmentChange={controlledOnDepartmentChange ?? setSelectedDepartment}
    />
  );
}
