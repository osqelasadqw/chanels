"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/firebase/config";
import { Chat } from "@/types/chat";
import Link from "next/link"; // Added Link for product linking

// Escrow Chat List Component for Admin
export default function EscrowChatList({ onChatSelect, selectedChatId }: { onChatSelect: (chatId: string, productId: string) => void, selectedChatId: string | null }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hiding chat functionality might not be directly applicable or may need different logic for admin.
  // const [hidingChatId, setHidingChatId] = useState<string | null>(null);
  const { user } = useAuth();

  // Admin ID -  TODO: This should be fetched from a secure config or environment variable
  const ADMIN_ID = "ADMIN_USER_ID";

  useEffect(() => {
    if (!user || !user.isAdmin) {
      setError("Access denied. You must be an admin.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Get escrow chats where the admin is a participant and isEscrowChat is true
    const chatsQuery = query(
      collection(db, "chats"),
      where("participants", "array-contains", ADMIN_ID),
      where("isEscrowChat", "==", true) // Filter for escrow chats
    );

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const chatList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        } as Chat));
        
        // Sort by createdAt in descending order (newest first)
        chatList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        setChats(chatList);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching escrow chats:", err);
        setError("Failed to load escrow chats");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, ADMIN_ID]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mb-3"></div>
        <p className="text-sm text-gray-500">Loading escrow conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-5 m-4 rounded-lg border border-red-200 flex flex-col items-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500 mb-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-center font-medium">{error}</p>
        {/* Optional: Add a retry button if appropriate */}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-4 bg-white">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-indigo-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M7.5 11.25v-1.5c0-.8.4-1.6.8-2.4C8.4 6.56 9.5 5.25 11.1 5.25h1.8c1.6 0 2.7 1.31 2.9 2.4.2.8.2 1.6 0 2.4" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">No Escrow Chats Yet</h3>
        <p className="text-gray-500 mb-6 text-center">When users request escrow services, those chats will appear here.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {chats.map((chat) => {
        // In escrow chats, one participant is the user, the other is the admin.
        // We want to display the user\'s information.
        const userParticipantId = chat.participants.find(id => id !== ADMIN_ID);
        
        const participantNames = chat.participantNames || {};
        const participantPhotos = chat.participantPhotos || {};
        
        const requestingUserName = userParticipantId && participantNames[userParticipantId] 
          ? participantNames[userParticipantId] 
          : "Unknown User";
          
        const requestingUserPhoto = userParticipantId && participantPhotos[userParticipantId]
          ? participantPhotos[userParticipantId]
          : "";

        const getMessageTime = () => {
          if (!chat.lastMessage?.timestamp && !chat.createdAt) return "Unknown";
          const timestamp = chat.lastMessage?.timestamp || chat.createdAt;
          const date = new Date(timestamp);
          const now = new Date();
          if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
          return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const isSelected = selectedChatId === chat.id;

        return (
          <div key={chat.id} className={`relative group ${isSelected ? 'bg-indigo-50' : ''}`}>
            <button 
              className={`w-full flex items-start p-4 hover:bg-indigo-50 transition-colors text-left
                ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}
              onClick={() => onChatSelect(chat.id, chat.productId || '')}
            >
              <div className="relative h-12 w-12 rounded-full overflow-hidden mr-4 flex-shrink-0 shadow-sm border border-gray-200">
                {requestingUserPhoto ? (
                  <Image
                    src={requestingUserPhoto}
                    alt={requestingUserName}
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold">
                    {requestingUserName.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Online status indicator could be added if needed */}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h3 className={`font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {requestingUserName}
                  </h3>
                  <span className={`text-xs ${isSelected ? 'text-indigo-500' : 'text-gray-500'}`}>
                    {getMessageTime()}
                  </span>
                </div>
                
                <p className={`text-sm truncate ${isSelected ? 'text-indigo-700' : 'text-gray-600'}`}>
                  {chat.lastMessage ? chat.lastMessage.text : "Escrow chat initiated"}
                </p>
                {chat.productId && (
                  <p className="text-xs text-gray-500 mt-1">
                    Product ID: {' '}
                    <Link href={`/products/${chat.productId}`} 
                          onClick={(e) => e.stopPropagation()} 
                          className="text-blue-500 hover:underline">
                      {chat.productId}
                    </Link>
                  </p>
                )}
                 {chat.originalChatId && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Original Chat: {' '}
                    <Link href={`/my-chats?chatId=${chat.originalChatId}`} 
                          onClick={(e) => e.stopPropagation()} 
                          className="text-blue-500 hover:underline">
                       View original chat
                    </Link>
                  </p>
                )}
              </div>
            </button>
            {/* Hide/Archive button can be added here if needed with admin-specific logic */}
          </div>
        );
      })}
    </div>
  );
} 