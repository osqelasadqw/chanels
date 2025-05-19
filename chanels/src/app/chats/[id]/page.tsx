"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ChatInterface from "@/components/chat/ChatInterface";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";

interface ChatPageProps {
  params: {
    id: string;
  };
}

export default function ChatPage({ params }: ChatPageProps) {
  const pathname = usePathname();
  const chatId = pathname.split('/').pop() || '';
  const router = useRouter();
  
  // Redirect to new chat interface
  useEffect(() => {
    router.replace('/my-chats');
  }, [router]);

  return (
    <div className="h-[calc(100vh-12rem)] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
} 