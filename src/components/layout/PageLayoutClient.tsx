"use client";

import React, { useEffect } from 'react';

interface PageLayoutClientProps {
  children: React.ReactNode;
}

export default function PageLayoutClient({ children }: PageLayoutClientProps) {
  // გვერდის ჩატვირთვისას ავტომატურად გადავიდეთ თავში
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <main className="flex-grow w-full">
        {children}
      </main>
    </>
  );
} 