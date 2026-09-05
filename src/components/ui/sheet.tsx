"use client";
import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;
export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />;
}
export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof Dialog.Content>) {
  return <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm" />
    <Dialog.Content className={cn("fixed inset-y-0 right-0 z-50 h-dvh border-l bg-background p-6 shadow-xl", className)} {...props}>
      {children}<Dialog.Close className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full border bg-white text-foreground" aria-label="关闭抽屉"><X size={18} /></Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>;
}
