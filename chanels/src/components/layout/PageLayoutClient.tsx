"use client";

import React from 'react';

interface PageLayoutClientProps {
  children: React.ReactNode;
}

export default function PageLayoutClient({ children }: PageLayoutClientProps) {
  return (
    <>
      <main className="flex-grow w-full">
        {children}
      </main>
    </>
  );
} 