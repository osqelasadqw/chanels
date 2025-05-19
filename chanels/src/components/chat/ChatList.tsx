"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Chat } from "@/types/chat";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";

const ADMIN_ID = "ADMIN_USER_ID"; // Defined ADMIN_ID

export default function ChatList() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const userChatListRef = collection(db, `users/${user.id}/chatList`);
    const q = query(userChatListRef); // Potentially add orderBy timestamp here if chatList items have it

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const chatReferences = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id, // This is the ID of the chat document in the main 'chats' collection
          ...(docSnapshot.data() as { lastMessage?: string, timestamp?: number, productId?: string, productName?: string, isEscrowChat?: boolean }) // Include potential fields from user's chatList
        }));

        const chatPromises = chatReferences.map(async (refData) => {
          const chatDocRef = doc(db, "chats", refData.id);
          const chatDoc = await getDoc(chatDocRef);
          if (chatDoc.exists()) {
            // Merge data from user's chatList (like a custom lastMessage or productName for escrow) with actual chat data
            // For escrow chats initiated by user, the `isEscrowChat` flag would be on the main chat document.
            return {
              id: chatDoc.id,
              ...chatDoc.data(),
              // Override or supplement with refData if necessary, e.g., if chatDoc doesn't have productName for some reason
              productName: chatDoc.data().productName || refData.productName,
            } as Chat;
          }
          return null;
        });

        const resolvedChats = (await Promise.all(chatPromises)).filter(chat => chat !== null) as Chat[];
        
        resolvedChats.sort((a, b) => {
          const tsA = a.lastMessage?.timestamp || a.createdAt || 0;
          const tsB = b.lastMessage?.timestamp || b.createdAt || 0;
          return tsB - tsA;
        });
        
        setChats(resolvedChats);
      } catch (err) {
        console.error("Error fetching or processing chats:", err);
        setError("Failed to load chats.");
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error("Error in onSnapshot for user chat list:", err);
      setError("Failed to listen for chat updates.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-bold mb-2">You need to sign in to view your chats</h2>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md">
        <p>{error}</p>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-lg shadow-md">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-gray-400 mb-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M7.5 11.25v-1.5c0-.8.4-1.6.8-2.4C8.4 6.56 9.5 5.25 11.1 5.25h1.8c1.6 0
2.7 1.31 2.9 2.4.2.8.2 1.6 0 2.4" />
        </svg>
        <h3 className="text-lg font-medium mb-2">No Chats Yet</h3>
        <p className="text-gray-500 mb-4">Start a conversation by contacting a seller or requesting escrow.</p>
        <Link 
          href="/" 
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md divide-y">
      {chats.map((chat) => {
        const participants = chat.participants || [];
        const otherParticipantId = participants.find(id => id !== user?.id) || "";
        
        let displayName = "Unknown User";
        let displayPhoto = "";
        let isAgent = false;

        if (otherParticipantId === ADMIN_ID && chat.isEscrowChat === true) {
          displayName = "Escrow Agent";
          displayPhoto = "/images/agent.png"; // Ensure agent.png is in public/images/
          isAgent = true;
        } else if (otherParticipantId) {
          displayName = chat.participantNames?.[otherParticipantId] || "User";
          displayPhoto = chat.participantPhotos?.[otherParticipantId] || "";
        }

        const fallbackInitial = displayName.charAt(0).toUpperCase();

        // Determine link: Escrow chats created from my-chats should link back to my-chats with params
        // Regular chats might link to /chats/[id]
        const chatLink = `/my-chats?chatId=${chat.id}${chat.productId ? `&productId=${chat.productId}` : ''}`;

        return (
          <Link 
            key={chat.id} 
            href={chatLink}
            className="flex items-center p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="h-12 w-12 rounded-full overflow-hidden mr-4 flex-shrink-0 border border-gray-200 shadow-sm bg-gray-100 flex items-center justify-center">
              {displayPhoto ? (
                <Image 
                  src={displayPhoto} 
                  alt={displayName}
                  width={48}
                  height={48}
                  className={`h-full w-full ${isAgent ? 'object-contain p-0.5' : 'object-cover'}`}
                  onError={(e) => { 
                    // Attempt to hide the broken image and show fallback if possible
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const fallback = parent.querySelector('.fallback-initial-div');
                      if (fallback) (fallback as HTMLElement).style.display = 'flex';
                    }
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
              {/* Fallback visible if displayPhoto is empty OR if Image onError hid it */}
              {!displayPhoto && (
                 <div className="fallback-initial-div h-full w-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-medium">
                  {fallbackInitial}
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <h3 className="font-medium truncate text-gray-800">{displayName}</h3>
                <span className="text-xs text-gray-500">
                  {chat.lastMessage?.timestamp 
                    ? new Date(chat.lastMessage.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                    : chat.createdAt ? new Date(chat.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ""
                  }
                </span>
              </div>
              
              <p className={`text-sm truncate ${chat.lastMessage?.senderId === user?.id ? 'text-gray-500' : 'text-gray-700 font-medium'}`}>
                 {chat.lastMessage?.senderId === user?.id && <span className="font-normal">შენ: </span>}
                 {chat.lastMessage ? chat.lastMessage.text : (isAgent ? "Escrow chat initiated" : "No messages yet")}
              </p>
            </div>
            
            {(chat.isEscrowChat || isAgent) && (
              <span className="ml-2 px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full whitespace-nowrap flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
                Escrow
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
} 