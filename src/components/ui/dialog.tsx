'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export const Dialog = D.Root;
export function DialogContent({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <D.Portal><D.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm" /><D.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-white p-6 shadow-xl"><D.Title className="pr-8 text-xl font-semibold">{title}</D.Title><D.Description className="mt-2 mb-6 text-sm text-slate-500">{description}</D.Description>{children}<D.Close className="absolute right-4 top-4 rounded p-1" aria-label="Close dialog"><X size={20} /></D.Close></D.Content></D.Portal>; }
