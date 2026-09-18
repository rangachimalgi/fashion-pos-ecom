"use client";

import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminPanelPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Back office
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Admin Panel</h1>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/billing" />}>
            <ArrowLeft className="size-3.5" />
            Back to POS
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 space-y-1">
          <h2 className="text-sm font-medium text-muted-foreground">Quick actions</h2>
          <p className="text-sm text-muted-foreground">
            Manage catalog tools from here. More admin tiles can land here later.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/billing/add-product" className="group block outline-none">
            <Card className="h-full transition-colors group-hover:border-foreground/20 group-hover:bg-muted/40 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
                  <PackagePlus className="size-5 text-foreground" />
                </div>
                <CardTitle>Add New Product</CardTitle>
                <CardDescription>
                  Create a new catalog item with images, variants, and stock.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  Open form →
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
